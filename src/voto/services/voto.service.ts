import {
  ForbiddenException,
  GoneException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLoggerService } from '@/audit/audit-logger.service';
import { ConfiguracionComicio } from '@/eleccion/configuracion-comicio/entities/configuracion-comicio.entity';
import { Eleccion } from '@/eleccion/entities/eleccion.entity';
import { EleccionEstado } from '@/eleccion/enums/eleccion-estado.enum';
import { Categoria } from '@/eleccion/lista/entities/categoria.entity';
import { Lista } from '@/eleccion/lista/entities/lista.entity';
import {
  OfertaElectoral,
  OfertaElectoralQueryService,
} from '@/eleccion/lista/services/oferta-electoral-query.service';
import { PadronVotante } from '@/padron/entities/padron-votante.entity';
import { BudConfigResponseDto } from '@/voto/dto/bud-config-response.dto';
import {
  BoletaDigitalResponseDto,
  CandidatoBoletaDigitalDto,
  CategoriaBoletaDigitalDto,
  CategoriaBoletaEstado,
} from '@/voto/dto/boleta-digital-response.dto';
import { VotoEmitidoAnonimoResponseDto } from '@/voto/dto/voto-emitido-anonimo-response.dto';

const ESTADOS_ELECCION_APTOS = [EleccionEstado.ABIERTA];
const ESTADOS_ELECCION_CERRADOS = [
  EleccionEstado.CERRADA,
  EleccionEstado.ESCRUTADA,
];

@Injectable()
export class VotoService {
  constructor(
    @InjectRepository(Eleccion)
    private readonly eleccionRepository: Repository<Eleccion>,
    @InjectRepository(ConfiguracionComicio)
    private readonly configuracionRepository: Repository<ConfiguracionComicio>,
    @InjectRepository(PadronVotante)
    private readonly padronVotanteRepository: Repository<PadronVotante>,
    private readonly ofertaElectoralQueryService: OfertaElectoralQueryService,
    private readonly auditLogger: AuditLoggerService,
  ) {}

  async obtenerConfiguracionBud(
    idEleccion: number,
  ): Promise<BudConfigResponseDto> {
    const eleccion = await this.eleccionRepository.findOne({
      where: { idEleccion },
    });
    if (!eleccion) {
      throw new NotFoundException('Comicio no encontrado');
    }
    const configuracion = await this.configuracionRepository.findOne({
      where: { idEleccion },
    });
    if (!configuracion) {
      throw new NotFoundException('Configuración del comicio no encontrada');
    }
    const resultadosDefinitivos = ESTADOS_ELECCION_CERRADOS.includes(
      eleccion.estado,
    );
    return {
      idEleccion: eleccion.idEleccion,
      nombre: eleccion.nombre,
      estado: eleccion.estado,
      tipoVotacion: eleccion.tipoVotacion,
      metodosAutenticacion: configuracion.metodosAutenticacion,
      resultadosDefinitivos,
      snapshotCongelado:
        resultadosDefinitivos || !configuracion.mostrarResultadosTiempoReal,
    };
  }

  /**
   * UAT-05 / VOTAR-379: registra un evento VOTO_EMITIDO anónimo tras el cast
   * on-chain. Sin JWT, sin nullifier, sin txHash, sin identidad ni IP persistida.
   */
  async registrarVotoEmitidoAnonimo(
    idEleccion: number,
  ): Promise<VotoEmitidoAnonimoResponseDto> {
    const eleccion = await this.eleccionRepository.findOne({
      where: { idEleccion },
    });
    if (!eleccion) {
      throw new NotFoundException('Comicio no encontrado');
    }
    this.assertEleccionAceptaVotos(eleccion);
    await this.auditLogger.logVotoEmitido({
      idEleccion,
      endpoint: `POST /elecciones/${idEleccion}/votos/emitido-anonimo`,
    });
    return { registrado: true, idEleccion };
  }

  async obtenerBoletaDigital(
    idEleccion: number,
    votanteHash: string,
  ): Promise<BoletaDigitalResponseDto> {
    await this.assertVotanteHabilitado(idEleccion, votanteHash);
    const oferta = await this.obtenerOfertaVoto(idEleccion);

    return {
      idEleccion: oferta.eleccion.idEleccion,
      nombreEleccion: oferta.eleccion.nombre,
      estadoEleccion: oferta.eleccion.estado,
      idBoleta: oferta.boleta.idBoleta,
      titulo: oferta.boleta.titulo,
      permitirVotoEnBlanco: oferta.configuracion.permitirVotoEnBlanco,
      categorias: this.mapCategorias(oferta),
    };
  }

  private async obtenerOfertaVoto(
    idEleccion: number,
  ): Promise<OfertaElectoral> {
    const oferta =
      await this.ofertaElectoralQueryService.obtenerOfertaPublicada(idEleccion);
    this.assertEleccionAceptaVotos(oferta.eleccion);
    return oferta;
  }

  /**
   * VOTAR-321: closed elections must answer HTTP 410 Gone on vote attempts.
   */
  private assertEleccionAceptaVotos(eleccion: Eleccion): void {
    if (ESTADOS_ELECCION_CERRADOS.includes(eleccion.estado)) {
      throw new GoneException(
        'El período de votación ha concluido. El comicio está cerrado.',
      );
    }
    if (!ESTADOS_ELECCION_APTOS.includes(eleccion.estado)) {
      throw new ForbiddenException('La elección no está habilitada para votar');
    }
  }

  private mapCategorias(oferta: OfertaElectoral): CategoriaBoletaDigitalDto[] {
    return oferta.categorias.map((categoria) => {
      const candidatos = this.mapCandidatosPorCategoria(
        oferta.listas,
        categoria,
      );

      return {
        idCategoria: categoria.idCategoria,
        nombre: categoria.nombre,
        descripcion: categoria.descripcion,
        orden: categoria.orden,
        estado:
          candidatos.length > 0
            ? CategoriaBoletaEstado.DISPONIBLE
            : CategoriaBoletaEstado.SIN_CANDIDATOS,
        candidatos,
      };
    });
  }

  private mapCandidatosPorCategoria(
    listas: Lista[],
    categoria: Categoria,
  ): CandidatoBoletaDigitalDto[] {
    return listas.flatMap((lista) =>
      (lista.candidatos ?? [])
        .filter((candidato) => candidato.idCategoria === categoria.idCategoria)
        .map((candidato) => ({
          idCandidato: candidato.idCandidato,
          idCategoria: candidato.idCategoria,
          idLista: lista.idLista,
          listId: lista.listId ?? lista.idLista,
          nombre: candidato.nombre,
          apellido: candidato.apellido,
          nombreCompleto: `${candidato.nombre} ${candidato.apellido}`,
          agrupacionPolitica: lista.nombre,
          numeroLista: lista.listId ?? lista.idLista,
          colorLista: lista.color,
          logoListaUrl: lista.logoUrl,
          fotoUrl: candidato.fotoUrl,
        })),
    );
  }

  private async assertVotanteHabilitado(
    idEleccion: number,
    votanteHash: string,
  ): Promise<void> {
    const count = await this.padronVotanteRepository
      .createQueryBuilder('votante')
      .innerJoin('votante.padron', 'padron')
      .innerJoin('padron.eleccion', 'eleccion')
      .where('eleccion.idEleccion = :idEleccion', { idEleccion })
      .andWhere('votante.hashHoja = :votanteHash', { votanteHash })
      .getCount();

    if (count === 0) {
      throw new ForbiddenException(
        'El votante no está habilitado para el comicio',
      );
    }
  }
}
