import {
  Injectable,
  NotFoundException,
  PreconditionFailedException,
  UnprocessableEntityException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Eleccion } from '../entities/eleccion.entity';
import { EleccionEstado } from '../enums/eleccion-estado.enum';
import { AbrirEleccionResponseDto } from '../dto/abrir-eleccion-response.dto';
import { ConfiguracionComicio } from '@/eleccion/configuracion-comicio/entities/configuracion-comicio.entity';
import { MerkleTree } from '@/padron/entities/merkle-tree.entity';
import { PadronElectoral } from '@/padron/entities/padron-electoral.entity';
import { MerkleTreeEstado } from '@/padron/enums/merkle-tree-estado.enum';
import { BlockchainService } from '@/blockchain/blockchain.service';
import { AuditLoggerService } from '@/audit/audit-logger.service';
import { EleccionGateway } from '@/eleccion/gateways/eleccion.gateway';
import { ElectionStateService } from '@/eleccion/services/election-state.service';

@Injectable()
export class AperturaComicioService {
  private readonly logger = new Logger(AperturaComicioService.name);

  constructor(
    @InjectRepository(Eleccion)
    private readonly eleccionRepository: Repository<Eleccion>,
    @InjectRepository(PadronElectoral)
    private readonly padronRepository: Repository<PadronElectoral>,
    @InjectRepository(MerkleTree)
    private readonly merkleRepository: Repository<MerkleTree>,
    @InjectRepository(ConfiguracionComicio)
    private readonly configuracionRepository: Repository<ConfiguracionComicio>,
    private readonly blockchainService: BlockchainService,
    private readonly auditLoggerService: AuditLoggerService,
    private readonly eleccionGateway: EleccionGateway,
    private readonly electionStateService: ElectionStateService,
  ) {}

  /**
   * Valida las precondiciones para abrir un comicio:
   * 1. La elección debe estar en estado CONFIGURADA
   * 2. Debe existir un padrón electoral
   * 3. El árbol de Merkle debe estar publicado on-chain
   * 4. La raíz de Merkle debe estar verificada en la blockchain
   */
  private async validarPrecondicionesApertura(
    eleccion: Eleccion,
  ): Promise<MerkleTree> {
    if (eleccion.estado !== EleccionEstado.CONFIGURADA) {
      throw new UnprocessableEntityException(
        `El comicio debe estar en estado CONFIGURADA para ser abierto. Estado actual: ${eleccion.estado}`,
      );
    }

    const padron = await this.padronRepository.findOne({
      where: { eleccion: { idEleccion: eleccion.idEleccion } },
      relations: ['merkleTree'],
    });

    if (!padron) {
      throw new PreconditionFailedException(
        'El comicio no tiene un padrón electoral cargado.',
      );
    }

    const merkle = await this.merkleRepository.findOne({
      where: { padron: { idPadron: padron.idPadron } },
    });

    if (!merkle) {
      throw new PreconditionFailedException(
        'El comicio no tiene un árbol de Merkle consolidado.',
      );
    }

    if (merkle.estado !== MerkleTreeEstado.PUBLICADO_ON_CHAIN) {
      throw new PreconditionFailedException(
        'Fallo de Precondición: Raíz de Merkle no detectada en la red descentralizada. ' +
          `Estado actual del árbol: ${merkle.estado}`,
      );
    }

    const isVerified = await this.blockchainService.verifyMerkleRootOnChain(
      eleccion.idEleccion,
      merkle.merkleRoot,
    );

    if (!isVerified) {
      throw new PreconditionFailedException(
        'Fallo de Precondición: La raíz de Merkle no pudo ser verificada en la blockchain. ' +
          'Verifique que el contrato esté desplegado y la raíz publicada correctamente.',
      );
    }

    return merkle;
  }

  /**
   * VOTAR-364: enables live dashboard tallies while the comicio is open.
   * CierreComicioService sets this back to false (snapshot freeze).
   */
  private async habilitarResultadosTiempoReal(
    idEleccion: number,
  ): Promise<void> {
    const config = await this.configuracionRepository.findOne({
      where: { idEleccion },
    });
    if (!config) {
      this.logger.warn(
        `Configuración no encontrada al habilitar resultados en vivo para comicio ${idEleccion}`,
      );
      return;
    }
    config.mostrarResultadosTiempoReal = true;
    await this.configuracionRepository.save(config);
  }

  /**
   * Apertura manual del comicio por un administrador (UAT-01 VOTAR-320).
   * Valida precondiciones, sincroniza estado on-chain via ElectionStateService,
   * registra auditoría y emite evento WebSocket.
   */
  async abrirManual(
    idEleccion: number,
    actorId: string,
    ipOrigen?: string,
  ): Promise<AbrirEleccionResponseDto> {
    const eleccion = await this.eleccionRepository.findOne({
      where: { idEleccion },
    });

    if (!eleccion) {
      throw new NotFoundException(`Elección ${idEleccion} no encontrada`);
    }

    // UAT-02: Validar precondiciones (padrón, Merkle on-chain)
    await this.validarPrecondicionesApertura(eleccion);

    const now = new Date();

    // AC 3: Transición de estado con sincronización on-chain (captura evento ElectionStateChanged)
    const eleccionAbierta =
      await this.electionStateService.transitionToAbierta(idEleccion);

    await this.habilitarResultadosTiempoReal(idEleccion);

    // Auditoría pública (UAT-01)
    await this.auditLoggerService.logComicioAbierto({
      idEleccion,
      actorId,
      modo: 'MANUAL',
      timestamp: now,
      ipOrigen,
    });

    // Emitir evento WebSocket para clientes conectados
    this.eleccionGateway.emitEleccionAbierta(eleccionAbierta.idEleccion);

    this.logger.log(
      `Comicio ${idEleccion} ("${eleccionAbierta.nombre}") abierto manualmente por ${actorId}`,
    );

    return {
      idEleccion,
      estado: EleccionEstado.ABIERTA,
      fechaApertura: now,
      modo: 'MANUAL',
    };
  }

  /**
   * Apertura automática del comicio por timestamp (scheduler - UAT-03 VOTAR-320).
   * El backend sincroniza el estado on-chain cuando se alcanza fechaInicio.
   */
  async abrirAutomatico(idEleccion: number): Promise<AbrirEleccionResponseDto> {
    const eleccion = await this.eleccionRepository.findOne({
      where: { idEleccion },
    });

    if (!eleccion) {
      throw new NotFoundException(`Elección ${idEleccion} no encontrada`);
    }

    // UAT-02: Validar precondiciones
    await this.validarPrecondicionesApertura(eleccion);

    const now = new Date();

    // AC 4: Sincronización automática de estado on-chain
    const eleccionAbierta =
      await this.electionStateService.transitionToAbierta(idEleccion);

    await this.habilitarResultadosTiempoReal(idEleccion);

    // Auditoría pública (UAT-03)
    await this.auditLoggerService.logComicioAbierto({
      idEleccion,
      actorId: 'SYSTEM',
      modo: 'AUTOMATICO',
      timestamp: now,
    });

    // Emitir evento WebSocket
    this.eleccionGateway.emitEleccionAbierta(eleccionAbierta.idEleccion);

    this.logger.log(
      `Comicio ${idEleccion} ("${eleccionAbierta.nombre}") abierto automáticamente`,
    );

    return {
      idEleccion,
      estado: EleccionEstado.ABIERTA,
      fechaApertura: now,
      modo: 'AUTOMATICO',
    };
  }
}
