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
   * This activates the hermetic seal (RootLocked) on-chain.
   */
  async transitionToAbierta(idEleccion: number): Promise<Eleccion> {
    const eleccion = await this.eleccionRepository.findOne({
      where: { idEleccion },
    });

    if (!eleccion) {
      throw new NotFoundException(`Elección ${idEleccion} no encontrada`);
    }

    if (eleccion.estado !== EleccionEstado.CONFIGURADA) {
      throw new UnprocessableEntityException(
        `La elección debe estar en estado CONFIGURADA para abrirse. Estado actual: ${eleccion.estado}`,
      );
    }

    const previousState = eleccion.estado;

    // Update state in database
    eleccion.estado = EleccionEstado.ABIERTA;
    const savedEleccion = await this.eleccionRepository.save(eleccion);

    // Sync state to blockchain to activate hermetic seal
    try {
      await this.blockchainService.syncElectionState(
        idEleccion,
        EleccionEstado.ABIERTA,
      );
    } catch (error) {
      // Rollback state change if blockchain sync fails
      savedEleccion.estado = previousState;
      await this.eleccionRepository.save(savedEleccion);
      throw error;
    }

    return savedEleccion;
  }

  /**
   * Transitions an election to the CERRADA (CLOSED) state and syncs with blockchain.
   */
  async transitionToCerrada(idEleccion: number): Promise<Eleccion> {
    const eleccion = await this.eleccionRepository.findOne({
      where: { idEleccion },
    });

    if (!eleccion) {
      throw new NotFoundException(`Elección ${idEleccion} no encontrada`);
    }

    if (eleccion.estado !== EleccionEstado.ABIERTA) {
      throw new UnprocessableEntityException(
        `La elección debe estar en estado ABIERTA para cerrarse. Estado actual: ${eleccion.estado}`,
      );
    }

    const previousState = eleccion.estado;

    // Update state in database
    eleccion.estado = EleccionEstado.CERRADA;
    const savedEleccion = await this.eleccionRepository.save(eleccion);

    // Sync state to blockchain
    try {
      await this.blockchainService.syncElectionState(
        idEleccion,
        EleccionEstado.CERRADA,
      );
    } catch (error) {
      // Rollback state change if blockchain sync fails
      savedEleccion.estado = previousState;
      await this.eleccionRepository.save(savedEleccion);
      throw error;
    }

    return savedEleccion;
  }

  /**
   * Transitions an election to the ESCRUTADA (TALLIED) state and syncs with blockchain.
   */
  async transitionToEscrutada(idEleccion: number): Promise<Eleccion> {
    const eleccion = await this.eleccionRepository.findOne({
      where: { idEleccion },
    });

    if (!eleccion) {
      throw new NotFoundException(`Elección ${idEleccion} no encontrada`);
    }

    if (eleccion.estado !== EleccionEstado.CERRADA) {
      throw new UnprocessableEntityException(
        `La elección debe estar en estado CERRADA para escrutarse. Estado actual: ${eleccion.estado}`,
      );
    }

    const previousState = eleccion.estado;

    // Update state in database
    eleccion.estado = EleccionEstado.ESCRUTADA;
    const savedEleccion = await this.eleccionRepository.save(eleccion);

    // Sync state to blockchain
    try {
      await this.blockchainService.syncElectionState(
        idEleccion,
        EleccionEstado.ESCRUTADA,
      );
    } catch (error) {
      // Rollback state change if blockchain sync fails
      savedEleccion.estado = previousState;
      await this.eleccionRepository.save(savedEleccion);
      throw error;
    }

    return savedEleccion;
  }
}
