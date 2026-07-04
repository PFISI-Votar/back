import {
  Injectable,
  NotFoundException,
  PreconditionFailedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Eleccion } from '../entities/eleccion.entity';
import { EleccionEstado } from '../enums/eleccion-estado.enum';
import { AbrirEleccionResponseDto } from '../dto/abrir-eleccion-response.dto';
import { MerkleTree } from '@/padron/entities/merkle-tree.entity';
import { PadronElectoral } from '@/padron/entities/padron-electoral.entity';
import { MerkleTreeEstado } from '@/padron/enums/merkle-tree-estado.enum';
import { BlockchainService } from '@/blockchain/blockchain.service';
import { AuditLoggerService } from '@/audit/audit-logger.service';

@Injectable()
export class AperturaComicioService {
  constructor(
    @InjectRepository(Eleccion)
    private readonly eleccionRepository: Repository<Eleccion>,
    @InjectRepository(PadronElectoral)
    private readonly padronRepository: Repository<PadronElectoral>,
    @InjectRepository(MerkleTree)
    private readonly merkleRepository: Repository<MerkleTree>,
    private readonly blockchainService: BlockchainService,
    private readonly auditLoggerService: AuditLoggerService,
    private readonly dataSource: DataSource,
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
   * Apertura manual del comicio por un administrador.
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

    await this.validarPrecondicionesApertura(eleccion);

    const now = new Date();

    return this.dataSource.transaction(async (manager) => {
      eleccion.estado = EleccionEstado.ABIERTA;
      await manager.save(Eleccion, eleccion);

      await this.auditLoggerService.logComicioAbierto({
        idEleccion,
        actorId,
        modo: 'MANUAL',
        timestamp: now,
        ipOrigen,
      });

      return {
        idEleccion,
        estado: EleccionEstado.ABIERTA,
        fechaApertura: now,
        modo: 'MANUAL',
      };
    });
  }

  /**
   * Apertura automática del comicio por timestamp (scheduler).
   */
  async abrirAutomatico(idEleccion: number): Promise<AbrirEleccionResponseDto> {
    const eleccion = await this.eleccionRepository.findOne({
      where: { idEleccion },
    });

    if (!eleccion) {
      throw new NotFoundException(`Elección ${idEleccion} no encontrada`);
    }

    await this.validarPrecondicionesApertura(eleccion);

    const now = new Date();

    return this.dataSource.transaction(async (manager) => {
      eleccion.estado = EleccionEstado.ABIERTA;
      await manager.save(Eleccion, eleccion);

      await this.auditLoggerService.logComicioAbierto({
        idEleccion,
        actorId: 'SYSTEM',
        modo: 'AUTOMATICO',
        timestamp: now,
      });

      return {
        idEleccion,
        estado: EleccionEstado.ABIERTA,
        fechaApertura: now,
        modo: 'AUTOMATICO',
      };
    });
  }
}
