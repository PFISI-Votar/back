import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Eleccion } from '@/eleccion/entities/eleccion.entity';
import { EleccionEstado } from '@/eleccion/enums/eleccion-estado.enum';
import { OfertaElectoralQueryService } from '@/eleccion/lista/services/oferta-electoral-query.service';
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
    private readonly ofertaElectoralQueryService: OfertaElectoralQueryService,
  ) {}

  /**
   * Transitions an election to the ABIERTA (OPEN) state and syncs with blockchain.
   * This activates the hermetic seal (RootLocked) on-chain before enabling voting off-chain.
   * Also publishes the voting window so BallotContract can close by `block.timestamp` (VOTAR-321),
   * and seals the candidate set on VoteRegistry (VOTAR-345) so recordVote only accepts ids from
   * the published boleta plus VOTO_BLANCO/VOTO_NULO.
   */
  async transitionToAbierta(idEleccion: number): Promise<Eleccion> {
    const eleccion = await this.findEleccionOrFail(idEleccion);
    if (eleccion.estado !== EleccionEstado.CONFIGURADA) {
      throw new UnprocessableEntityException(
        `La elección debe estar en estado CONFIGURADA para abrirse. Estado actual: ${eleccion.estado}`,
      );
    }
    const candidateIds = await this.resolveCandidateIds(idEleccion);
    await this.blockchainService.registerCandidates(idEleccion, candidateIds);
    await this.blockchainService.syncElectionWindow(
      eleccion.idEleccion,
      eleccion.fechaInicio,
      eleccion.fechaFin,
    );
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

  private async resolveCandidateIds(idEleccion: number): Promise<number[]> {
    const oferta =
      await this.ofertaElectoralQueryService.obtenerOfertaPublicada(idEleccion);
    return [
      ...new Set(
        oferta.listas.flatMap((lista) =>
          (lista.candidatos ?? []).map((candidato) => candidato.idCandidato),
        ),
      ),
    ];
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
