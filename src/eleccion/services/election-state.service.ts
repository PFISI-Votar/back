import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Eleccion } from '@/eleccion/entities/eleccion.entity';
import { EleccionEstado } from '@/eleccion/enums/eleccion-estado.enum';
import { BlockchainService } from '@/blockchain/blockchain.service';

/**
 * Service responsible for managing election state transitions
 * and synchronizing state changes with the blockchain.
 * @dev VOTAR-336: Hermetic seal integration point.
 * Transitions sync on-chain first, then persist off-chain to avoid
 * a window where the DB is ABIERTA before the hermetic seal activates.
 */
@Injectable()
export class ElectionStateService {
  constructor(
    @InjectRepository(Eleccion)
    private readonly eleccionRepository: Repository<Eleccion>,
    private readonly blockchainService: BlockchainService,
  ) {}

  /**
   * Transitions an election to the ABIERTA (OPEN) state and syncs with blockchain.
   * This activates the hermetic seal (RootLocked) on-chain before enabling voting off-chain.
   */
  async transitionToAbierta(idEleccion: number): Promise<Eleccion> {
    const eleccion = await this.findEleccionOrFail(idEleccion);
    if (eleccion.estado !== EleccionEstado.CONFIGURADA) {
      throw new UnprocessableEntityException(
        `La elección debe estar en estado CONFIGURADA para abrirse. Estado actual: ${eleccion.estado}`,
      );
    }
    return this.syncOnChainThenPersist(eleccion, EleccionEstado.ABIERTA);
  }

  /**
   * Transitions an election to the CERRADA (CLOSED) state and syncs with blockchain.
   */
  async transitionToCerrada(idEleccion: number): Promise<Eleccion> {
    const eleccion = await this.findEleccionOrFail(idEleccion);
    if (eleccion.estado !== EleccionEstado.ABIERTA) {
      throw new UnprocessableEntityException(
        `La elección debe estar en estado ABIERTA para cerrarse. Estado actual: ${eleccion.estado}`,
      );
    }
    return this.syncOnChainThenPersist(eleccion, EleccionEstado.CERRADA);
  }

  /**
   * Transitions an election to the ESCRUTADA (TALLIED) state and syncs with blockchain.
   */
  async transitionToEscrutada(idEleccion: number): Promise<Eleccion> {
    const eleccion = await this.findEleccionOrFail(idEleccion);
    if (eleccion.estado !== EleccionEstado.CERRADA) {
      throw new UnprocessableEntityException(
        `La elección debe estar en estado CERRADA para escrutarse. Estado actual: ${eleccion.estado}`,
      );
    }
    return this.syncOnChainThenPersist(eleccion, EleccionEstado.ESCRUTADA);
  }

  private async findEleccionOrFail(idEleccion: number): Promise<Eleccion> {
    const eleccion = await this.eleccionRepository.findOne({
      where: { idEleccion },
    });
    if (!eleccion) {
      throw new NotFoundException(`Elección ${idEleccion} no encontrada`);
    }
    return eleccion;
  }

  private async syncOnChainThenPersist(
    eleccion: Eleccion,
    nextEstado: EleccionEstado,
  ): Promise<Eleccion> {
    await this.blockchainService.syncElectionState(
      eleccion.idEleccion,
      nextEstado,
    );
    eleccion.estado = nextEstado;
    return this.eleccionRepository.save(eleccion);
  }
}
