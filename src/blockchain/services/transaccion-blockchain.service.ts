import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BlockchainService } from '@/blockchain/blockchain.service';
import type { BlockchainTransactionAuditEntry } from '@/blockchain/blockchain-transaction.types';
import { TransaccionBlockchain } from '@/blockchain/entities/transaccion-blockchain.entity';
import { normalizeDescripcionLegible } from '@/blockchain/utils/audit-transaction-description.util';
import {
  buildRevoteOverwriteTimelineFromIndexedVotes,
  isIndexedRevote,
  isIndexedVoteTransaction,
  type RevoteOverwriteTimelinePoint,
} from '@/blockchain/utils/revote-overwrite-timeline.util';
import { MerkleTree } from '@/padron/entities/merkle-tree.entity';
import { PadronElectoral } from '@/padron/entities/padron-electoral.entity';

@Injectable()
export class TransaccionBlockchainService {
  private readonly logger = new Logger(TransaccionBlockchainService.name);

  constructor(
    @InjectRepository(TransaccionBlockchain)
    private readonly transaccionRepository: Repository<TransaccionBlockchain>,
    @InjectRepository(MerkleTree)
    private readonly merkleTreeRepository: Repository<MerkleTree>,
    @InjectRepository(PadronElectoral)
    private readonly padronRepository: Repository<PadronElectoral>,
    @Inject(forwardRef(() => BlockchainService))
    private readonly blockchainService: BlockchainService,
  ) {}

  /**
   * VOTAR-373 — idempotent append from a confirmed on-chain tx hash.
   */
  async registrarDesdeTxHash(
    idEleccion: number,
    txHash: string,
  ): Promise<void> {
    const normalized = txHash.trim().toLowerCase();
    if (!/^0x[0-9a-f]{64}$/.test(normalized)) {
      throw new BadRequestException('hash de transacción inválido');
    }

    const existing = await this.transaccionRepository.findOne({
      where: { hashTransaccion: normalized },
    });
    if (existing) {
      return;
    }

    const entry =
      await this.blockchainService.parseElectionTransactionAuditEntry(
        normalized,
        idEleccion,
      );
    if (!entry) {
      this.logger.warn(
        `Tx ${normalized} no contiene eventos indexables para el comicio ${idEleccion}`,
      );
      return;
    }

    await this.transaccionRepository.save({
      hashTransaccion: entry.hashTransaccion,
      idEleccion,
      numeroBloque: entry.numeroBloque,
      marcaTiempo: new Date(entry.marcaTiempo),
      contratoEtiqueta: entry.contratoEtiqueta,
      nombreEvento: entry.nombreEvento,
      descripcionLegible: entry.descripcionLegible,
      logIndex: entry.logIndex ?? 0,
    });
  }

  /**
   * Anonymous vote tx registration — validates SignedVoteCast before indexing.
   */
  async registrarVotoPublico(
    idEleccion: number,
    txHash: string,
  ): Promise<void> {
    const participation =
      await this.blockchainService.getVoteParticipationByTxHash(txHash);
    if (participation.idEleccion !== idEleccion) {
      throw new NotFoundException(
        'La transacción no corresponde al comicio indicado.',
      );
    }
    await this.registrarDesdeTxHash(idEleccion, txHash);
  }

  async listarPorEleccion(
    idEleccion: number,
  ): Promise<BlockchainTransactionAuditEntry[]> {
    await this.backfillMerkleSiVacio(idEleccion);

    const rows = await this.transaccionRepository.find({
      where: { idEleccion },
      order: { numeroBloque: 'DESC', logIndex: 'DESC' },
    });

    return rows.map((row) => ({
      hashTransaccion: row.hashTransaccion,
      numeroBloque: row.numeroBloque,
      marcaTiempo: row.marcaTiempo.toISOString(),
      contratoEtiqueta: row.contratoEtiqueta,
      nombreEvento: row.nombreEvento,
      descripcionLegible: normalizeDescripcionLegible(row.descripcionLegible),
      explorerUrl: this.blockchainService.buildExplorerUrl(row.hashTransaccion),
    }));
  }

  /**
   * VOTAR-329 — hourly overwrite-ratio series from the VOTAR-373 transaction index.
   */
  async buildRevoteOverwriteTimeline(
    idEleccion: number,
    horasVentana = 12,
  ): Promise<RevoteOverwriteTimelinePoint[]> {
    const rows = await this.transaccionRepository.find({
      where: { idEleccion },
      order: { marcaTiempo: 'ASC', numeroBloque: 'ASC', logIndex: 'ASC' },
    });

    const voteEvents = rows
      .filter((row) =>
        isIndexedVoteTransaction({
          nombreEvento: row.nombreEvento,
          descripcionLegible: normalizeDescripcionLegible(
            row.descripcionLegible,
          ),
        }),
      )
      .map((row) => ({
        timestampMs: row.marcaTiempo.getTime(),
        isRevote: isIndexedRevote({
          descripcionLegible: normalizeDescripcionLegible(
            row.descripcionLegible,
          ),
        }),
      }));

    return buildRevoteOverwriteTimelineFromIndexedVotes(
      voteEvents,
      horasVentana,
    );
  }

  /**
   * Best-effort index after admin blockchain ops; never throws to callers.
   */
  indexarSilencioso(idEleccion: number, txHash: string): void {
    if (!txHash?.trim()) {
      return;
    }
    void this.registrarDesdeTxHash(idEleccion, txHash).catch((error) => {
      const message =
        error instanceof Error ? error.message : 'Error desconocido';
      this.logger.warn(
        `No se pudo indexar tx ${txHash} del comicio ${idEleccion}: ${message}`,
      );
    });
  }

  private async backfillMerkleSiVacio(idEleccion: number): Promise<void> {
    const count = await this.transaccionRepository.count({
      where: { idEleccion },
    });
    if (count > 0) {
      return;
    }

    const padron = await this.padronRepository.findOne({
      where: { eleccion: { idEleccion } },
      relations: ['merkleTree'],
    });
    const merkle = padron?.merkleTree;
    if (!merkle?.txHashPublicacion || !merkle.numeroBloque) {
      return;
    }

    const hash = merkle.txHashPublicacion.toLowerCase();
    const exists = await this.transaccionRepository.findOne({
      where: { hashTransaccion: hash },
    });
    if (exists) {
      return;
    }

    const marcaTiempo =
      merkle.fechaPublicacionOnChain ?? merkle.fechaGeneracion ?? new Date();

    await this.transaccionRepository.save({
      hashTransaccion: hash,
      idEleccion,
      numeroBloque: merkle.numeroBloque,
      marcaTiempo,
      contratoEtiqueta: 'MerkleRootStore',
      nombreEvento: 'RootPublished',
      descripcionLegible: 'Raíz Merkle del padrón publicada on-chain',
      logIndex: 0,
    });
  }
}
