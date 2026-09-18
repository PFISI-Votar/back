import {
  ConflictException,
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
import {
  EleccionGateway,
  TransaccionEleccionTipo,
} from '@/eleccion/gateways/eleccion.gateway';

/**
 * Service responsible for managing election state transitions
 * and synchronizing state changes with the blockchain.
 * @dev VOTAR-336: Hermetic seal integration point.
 * @dev VOTAR-327: Seals the voting window (MerkleRootStore) and the
 * RevoteConfig audit trail (ElectionFactory) before opening.
 * Transitions sync on-chain first, then persist off-chain to avoid
 * a window where the DB is ABIERTA before the hermetic seal activates.
 */
@Injectable()
export class ElectionStateService {
  /**
   * VOTAR-434 / VOTAR-481: evita que dos transiciones concurrentes para el
   * mismo comicio (ej. apertura o cierre automático del scheduler + apertura
   * o cierre manual del admin) compitan por la misma wallet on-chain,
   * causando colisión de nonce y reverts sin motivo legible.
   */
  private readonly transicionesEnCurso = new Set<number>();

  constructor(
    @InjectRepository(Eleccion)
    private readonly eleccionRepository: Repository<Eleccion>,
    private readonly blockchainService: BlockchainService,
    private readonly ofertaElectoralQueryService: OfertaElectoralQueryService,
    private readonly eleccionGateway: EleccionGateway,
  ) {}

  /**
   * Transitions an election to the ABIERTA (OPEN) state and syncs with blockchain.
   * This activates the hermetic seal (RootLocked) on-chain before enabling voting off-chain.
   * Also publishes the voting window so BallotContract can close by `block.timestamp` (VOTAR-321),
   * and seals the candidate set on VoteRegistry (VOTAR-345) so recordVote only accepts ids from
   * the published boleta plus VOTO_BLANCO/VOTO_NULO.
   */
  async transitionToAbierta(idEleccion: number): Promise<Eleccion> {
    return this.withTransitionLock(
      idEleccion,
      'APERTURA',
      async (marcarEnProgreso) => {
        const eleccion = await this.findEleccionOrFail(idEleccion);
        if (eleccion.estado !== EleccionEstado.CONFIGURADA) {
          throw new UnprocessableEntityException(
            `La elección debe estar en estado CONFIGURADA para abrirse. Estado actual: ${eleccion.estado}`,
          );
        }
        marcarEnProgreso();
        const candidateIds = await this.resolveCandidateIds(idEleccion);
        await this.blockchainService.registerCandidates(
          idEleccion,
          candidateIds,
        );
        await this.blockchainService.syncElectionWindow(
          eleccion.idEleccion,
          eleccion.fechaInicio,
          eleccion.fechaFin,
        );
        // VOTAR-327: seal RevoteConfig + voting window before the DB flips to
        // ABIERTA, same hermetic-seal-before-persist principle as VOTAR-336.
        await this.blockchainService.lockElectionWindow(idEleccion);
        await this.blockchainService.lockRevoteConfig(idEleccion);
        return this.syncOnChainThenPersist(eleccion, EleccionEstado.ABIERTA);
      },
    );
  }

  /**
   * Transitions an election to the CERRADA (CLOSED) state and syncs with blockchain.
   * @dev VOTAR-481: usa el mismo lock por-elección que `transitionToAbierta`
   * (VOTAR-434) — el cierre manual y el cierre automático del scheduler
   * compiten por la misma wallet on-chain igual que la apertura, y sin este
   * lock esa carrera terminaba en colisión de nonce.
   */
  async transitionToCerrada(idEleccion: number): Promise<Eleccion> {
    return this.withTransitionLock(
      idEleccion,
      'CIERRE',
      async (marcarEnProgreso) => {
        const eleccion = await this.findEleccionOrFail(idEleccion);
        if (eleccion.estado !== EleccionEstado.ABIERTA) {
          throw new UnprocessableEntityException(
            `La elección debe estar en estado ABIERTA para cerrarse. Estado actual: ${eleccion.estado}`,
          );
        }
        marcarEnProgreso();
        return this.syncOnChainThenPersist(eleccion, EleccionEstado.CERRADA);
      },
    );
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

  /**
   * Transitions an election to the ARCHIVADA state.
   * @dev VOTAR-322: a diferencia de las demás transiciones, esta es
   * estrictamente off-chain — no llama a `blockchainService` bajo ninguna
   * circunstancia. El contrato ya quedó inmutable en CLOSED al cerrarse
   * (transitionToCerrada) y debe permanecer así (costo cero de gas).
   */
  async transitionToArchivada(idEleccion: number): Promise<Eleccion> {
    const eleccion = await this.findEleccionOrFail(idEleccion);
    if (eleccion.estado !== EleccionEstado.CERRADA) {
      throw new UnprocessableEntityException(
        `El comicio debe estar en estado CERRADA para archivarse. Estado actual: ${eleccion.estado}`,
      );
    }
    eleccion.estado = EleccionEstado.ARCHIVADA;
    return this.eleccionRepository.save(eleccion);
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

  /**
   * @dev VOTAR-481: el conflicto de lock (409) queda solo en la excepción
   * que recibe el caller por HTTP — no se emite por WebSocket, porque un
   * broadcast global le llegaría también a la transición que sí tiene el
   * lock, pisando su feedback de "en progreso" con un "Reintentá" que no
   * le corresponde.
   *
   * `fn` recibe `marcarEnProgreso` para emitir "en progreso" recién después
   * de validar el estado de la elección (ver transitionToAbierta/Cerrada):
   * si la precondición de estado falla, nunca se mostró un spinner y no
   * corresponde emitir una falla que lo "limpie". Si `fn` falla después de
   * haber llamado a `marcarEnProgreso`, se emite `transaccion-fallida` para
   * que el cliente cierre ese spinner en vez de dejarlo colgado.
   */
  private async withTransitionLock<T>(
    idEleccion: number,
    tipo: TransaccionEleccionTipo,
    fn: (marcarEnProgreso: () => void) => Promise<T>,
  ): Promise<T> {
    if (this.transicionesEnCurso.has(idEleccion)) {
      throw new ConflictException(
        `Ya hay una transición de estado en curso para la elección ${idEleccion}. Reintentá en unos segundos.`,
      );
    }
    this.transicionesEnCurso.add(idEleccion);
    let progresoEmitido = false;
    const marcarEnProgreso = () => {
      progresoEmitido = true;
      this.eleccionGateway.emitTransaccionEnProgreso(idEleccion, tipo);
    };
    try {
      return await fn(marcarEnProgreso);
    } catch (error) {
      if (progresoEmitido) {
        this.eleccionGateway.emitTransaccionFallida(idEleccion, tipo);
      }
      throw error;
    } finally {
      this.transicionesEnCurso.delete(idEleccion);
    }
  }
}
