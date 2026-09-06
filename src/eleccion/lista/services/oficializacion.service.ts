import {
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { BlockchainService } from '@/blockchain/blockchain.service';
import { CategoriasService } from '@/categoria/categoria.service';
import { ConfiguracionComicio } from '@/eleccion/configuracion-comicio/entities/configuracion-comicio.entity';
import { mapConfiguracionToRevoteConfig } from '@/eleccion/configuracion-comicio/mappers/revote-config.mapper';
import { BoletaService } from '@/eleccion/lista/services/boleta.service';
import {
  DespliegueOnChainResponseDto,
  ListaMapeoItemDto,
  OficializarResponseDto,
  StackOnChainStatusDto,
} from '@/eleccion/lista/dto/lista-response.dto';
import { Boleta } from '@/eleccion/lista/entities/boleta.entity';
import { Eleccion } from '@/eleccion/entities/eleccion.entity';
import { Lista } from '@/eleccion/lista/entities/lista.entity';
import { EleccionEstado } from '@/eleccion/enums/eleccion-estado.enum';
import { EstadoBoleta } from '@/eleccion/lista/enums/estado-boleta.enum';
import { EstadoLista } from '@/eleccion/lista/enums/estado-lista.enum';
import { assertEleccionEditable } from '@/eleccion/utils/eleccion-editable.util';
import { MinimoCandidatosViolationException } from '@/eleccion/rules-engine/exceptions/minimo-candidatos-violation.exception';
import { RulesEngineService } from '@/eleccion/rules-engine/rules-engine.service';
import { PadronService } from '@/padron/padron.service';

@Injectable()
export class OficializacionService {
  private readonly logger = new Logger(OficializacionService.name);

  constructor(
    @InjectRepository(Eleccion)
    private readonly eleccionRepository: Repository<Eleccion>,
    @InjectRepository(Lista)
    private readonly listaRepository: Repository<Lista>,
    @InjectRepository(Boleta)
    private readonly boletaRepository: Repository<Boleta>,
    @InjectRepository(ConfiguracionComicio)
    private readonly configuracionRepository: Repository<ConfiguracionComicio>,
    private readonly boletaService: BoletaService,
    private readonly dataSource: DataSource,
    private readonly rulesEngineService: RulesEngineService,
    private readonly categoriasService: CategoriasService,
    private readonly padronService: PadronService,
    private readonly blockchainService: BlockchainService,
  ) {}

  async oficializar(idEleccion: number): Promise<OficializarResponseDto> {
    const eleccion = await this.eleccionRepository.findOne({
      where: { idEleccion },
    });
    if (!eleccion) {
      throw new NotFoundException(`Elección ${idEleccion} no encontrada`);
    }
    assertEleccionEditable(eleccion);
    await this.padronService.validarPadronParaOficializar(idEleccion);
    await this.categoriasService.validarCategoriasParaOficializar(idEleccion);
    const boleta = await this.boletaService.findBoletaByEleccion(idEleccion);
    if (!boleta) {
      throw new UnprocessableEntityException(
        'No existe boleta electoral para oficializar',
      );
    }
    const boletaConCategorias = await this.boletaRepository.findOne({
      where: { idBoleta: boleta.idBoleta },
      relations: ['categorias'],
    });
    const listas = await this.listaRepository.find({
      where: { idBoleta: boleta.idBoleta, estado: EstadoLista.BORRADOR },
      relations: ['candidatos'],
      order: { idLista: 'ASC' },
    });
    const listasConCandidatos = listas.filter(
      (lista) => (lista.candidatos?.length ?? 0) > 0,
    );
    if (listasConCandidatos.length === 0) {
      throw new UnprocessableEntityException(
        'Debe existir al menos una lista con candidatos para oficializar',
      );
    }
    const minimoValidation = this.rulesEngineService.validateMinimoCandidatos({
      categorias: (boletaConCategorias?.categorias ?? []).map((categoria) => ({
        idCategoria: categoria.idCategoria,
        nombre: categoria.nombre,
        minimoPostulantes: categoria.minimoPostulantes,
      })),
      listas: listasConCandidatos.map((lista) => ({
        idLista: lista.idLista,
        nombre: lista.nombre,
        sigla: lista.sigla,
        candidatos: (lista.candidatos ?? []).map((candidato) => ({
          idCategoria: candidato.idCategoria,
        })),
      })),
    });
    if (!minimoValidation.valid) {
      throw new MinimoCandidatosViolationException(minimoValidation.violations);
    }
    const now = new Date();
    const mapeo: ListaMapeoItemDto[] = [];
    return this.dataSource
      .transaction(async (manager) => {
        for (let index = 0; index < listasConCandidatos.length; index++) {
          const lista = listasConCandidatos[index];
          const listId = index + 1;
          lista.listId = listId;
          lista.estado = EstadoLista.OFICIALIZADA;
          lista.fechaOficializacion = now;
          await manager.save(Lista, lista);
          mapeo.push({
            idLista: lista.idLista,
            listId,
            nombre: lista.nombre,
            sigla: lista.sigla,
          });
        }
        boleta.estado = EstadoBoleta.PUBLICADA;
        boleta.fechaPublicacion = now;
        await manager.save(Boleta, boleta);
        eleccion.estado = EleccionEstado.CONFIGURADA;
        await manager.save(Eleccion, eleccion);
        return {
          idEleccion,
          estado: EleccionEstado.CONFIGURADA,
          mapeo,
        };
      })
      .then(async (result) => {
        const onChainDesplegado =
          await this.desplegarStackOnChainBestEffort(idEleccion);
        return { ...result, onChainDesplegado };
      });
  }

  /**
   * VOTAR-473: permite reintentar solo el despliegue on-chain cuando el comicio
   * ya quedó CONFIGURADA pero la wallet/RPC falló en el primer intento.
   * A diferencia de oficializar, propaga el error (no lo swallow) para que la UI reintente.
   */
  async reintentarDespliegueOnChain(
    idEleccion: number,
  ): Promise<DespliegueOnChainResponseDto> {
    const eleccion = await this.eleccionRepository.findOne({
      where: { idEleccion },
    });
    if (!eleccion) {
      throw new NotFoundException(`Elección ${idEleccion} no encontrada`);
    }
    if (eleccion.estado !== EleccionEstado.CONFIGURADA) {
      throw new UnprocessableEntityException(
        `Solo se puede reintentar el despliegue on-chain en comicios CONFIGURADA. Estado actual: ${eleccion.estado}`,
      );
    }

    const deployment = await this.desplegarStackOnChainOrFail(idEleccion);
    return {
      idEleccion,
      alreadyDeployed: deployment.alreadyDeployed,
      txHash: deployment.txHash,
      ballot: deployment.ballot,
      voteRegistry: deployment.voteRegistry,
      auditView: deployment.auditView,
    };
  }

  async obtenerEstadoStackOnChain(
    idEleccion: number,
  ): Promise<StackOnChainStatusDto> {
    const eleccion = await this.eleccionRepository.findOne({
      where: { idEleccion },
    });
    if (!eleccion) {
      throw new NotFoundException(`Elección ${idEleccion} no encontrada`);
    }

    const desplegado =
      await this.blockchainService.hasElectionStackDeployed(idEleccion);
    return { idEleccion, desplegado };
  }

  /** Best-effort used by oficializar: swallows ServiceUnavailable so DB commit sticks. */
  private async desplegarStackOnChainBestEffort(
    idEleccion: number,
  ): Promise<boolean> {
    try {
      await this.desplegarStackOnChainOrFail(idEleccion);
      return true;
    } catch (error) {
      if (error instanceof ServiceUnavailableException) {
        this.logger.warn(
          `Comicio ${idEleccion}: despliegue on-chain omitido — ${error.message}`,
        );
        return false;
      }
      if (error instanceof UnprocessableEntityException) {
        this.logger.warn(
          `Comicio ${idEleccion}: despliegue on-chain omitido — ${error.message}`,
        );
        return false;
      }
      throw error;
    }
  }

  private async desplegarStackOnChainOrFail(idEleccion: number): Promise<{
    ballot: string;
    voteRegistry: string;
    auditView: string;
    txHash: string;
    alreadyDeployed: boolean;
  }> {
    const config = await this.configuracionRepository.findOne({
      where: { idEleccion },
    });
    if (!config) {
      throw new UnprocessableEntityException(
        `Comicio ${idEleccion}: no se encontró la configuración del comicio para desplegar on-chain.`,
      );
    }
    const revoteConfig = mapConfiguracionToRevoteConfig(config);
    const deployment = await this.blockchainService.deployElectionStack(
      idEleccion,
      revoteConfig,
    );
    if (deployment.alreadyDeployed) {
      this.logger.log(
        `Comicio ${idEleccion}: stack on-chain ya existía (revoteEnabled=${revoteConfig.enabled}).`,
      );
    } else {
      this.logger.log(
        `Comicio ${idEleccion}: stack desplegado on-chain tx=${deployment.txHash} revoteEnabled=${revoteConfig.enabled}.`,
      );
    }
    return deployment;
  }

  async obtenerMapeo(idEleccion: number): Promise<ListaMapeoItemDto[]> {
    const eleccion = await this.eleccionRepository.findOne({
      where: { idEleccion },
    });
    if (!eleccion) {
      throw new NotFoundException(`Elección ${idEleccion} no encontrada`);
    }
    if (eleccion.estado === EleccionEstado.BORRADOR) {
      throw new UnprocessableEntityException(
        'El comicio aún no ha sido oficializado',
      );
    }
    const boleta = await this.boletaRepository.findOne({
      where: { idEleccion },
    });
    if (!boleta) {
      return [];
    }
    const listas = await this.listaRepository.find({
      where: {
        idBoleta: boleta.idBoleta,
        estado: EstadoLista.OFICIALIZADA,
      },
      order: { listId: 'ASC' },
    });
    return listas
      .filter((lista) => lista.listId !== null)
      .map((lista) => ({
        idLista: lista.idLista,
        listId: lista.listId as number,
        nombre: lista.nombre,
        sigla: lista.sigla,
      }));
  }
}
