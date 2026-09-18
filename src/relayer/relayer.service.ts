import { createHash, randomBytes } from 'node:crypto';
import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLoggerService } from '@/audit/audit-logger.service';
import { BlockchainService } from '@/blockchain/blockchain.service';
import {
  stripBytes32Prefix,
  toBytes32Hex,
} from '@/padron/utils/merkle.util';
import { PadronService } from '@/padron/padron.service';
import { RelayCastDto } from '@/relayer/dto/relay-cast.dto';
import {
  RelayAuthorizationResponseDto,
  RelayCastResponseDto,
} from '@/relayer/dto/relay-response.dto';
import { RelayerCapacidad } from '@/relayer/entities/relayer-capacidad.entity';
import { EthersRelayBroadcaster } from '@/relayer/ethers-relay-broadcaster';
import { RelayCastFailedError } from '@/relayer/relay-errors';
import { RevotePolicyService } from '@/voto/services/revote-policy.service';

const DEFAULT_TTL_MS = 120_000;

const hashToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex');

@Injectable()
export class RelayerService {
  private readonly logger = new Logger(RelayerService.name);

  constructor(
    @InjectRepository(RelayerCapacidad)
    private readonly capacidadRepository: Repository<RelayerCapacidad>,
    private readonly padronService: PadronService,
    private readonly blockchainService: BlockchainService,
    private readonly broadcaster: EthersRelayBroadcaster,
    private readonly configService: ConfigService,
    private readonly revotePolicyService: RevotePolicyService,
    private readonly auditLogger: AuditLoggerService,
  ) {}

  /**
   * Emite una capacidad de gas. Exige sesión de votante, pero no recibe el
   * voto: no hay fila que una identidad y contenido del sufragio.
   */
  async emitirAutorizacion(
    idEleccion: number,
    votanteHash: string,
  ): Promise<RelayAuthorizationResponseDto> {
    await this.padronService.solicitarMerkleProofAutenticada(
      idEleccion,
      votanteHash,
    );
    const estado = await this.revotePolicyService.obtenerEstado(
      idEleccion,
      votanteHash,
    );
    if (!estado.puedeVotar) {
      if (
        typeof estado.proximoReintentoEnSegundos === 'number' &&
        estado.proximoReintentoEnSegundos > 0
      ) {
        throw new HttpException(
          {
            statusCode: HttpStatus.TOO_MANY_REQUESTS,
            message: 'Debe esperar antes de volver a sufragar.',
            proximoReintentoEnSegundos: estado.proximoReintentoEnSegundos,
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      throw new HttpException(
        {
          statusCode: HttpStatus.FORBIDDEN,
          message: 'No quedan intentos de sufragio disponibles para este comicio.',
        },
        HttpStatus.FORBIDDEN,
      );
    }

    const relayToken = randomBytes(32).toString('hex');
    const ttlMs = Number(
      this.configService.get<number>('RELAYER_CAPABILITY_TTL_MS') ??
        DEFAULT_TTL_MS,
    );
    const expiraEn = new Date(Date.now() + ttlMs);
    await this.capacidadRepository.save(
      this.capacidadRepository.create({
        tokenHash: hashToken(relayToken),
        idEleccion,
        claveIntento: votanteHash,
        expiraEn,
        consumidaEn: null,
      }),
    );
    await this.auditLogger.logRelayerCapacidadEmitida({
      idEleccion,
      actorId: votanteHash,
    });
    return { relayToken, expiresAt: expiraEn.toISOString() };
  }

  /**
   * Transmite castSignedVote con la clave del relayer. El cliente llega sin
   * cookie de sesión; la capacidad ya fue desacoplada de la identidad.
   * La prueba Merkle sale del padrón, no del body, para no aceptar un path
   * armado por el cliente.
   */
  async transmitir(
    idEleccion: number,
    dto: RelayCastDto,
  ): Promise<RelayCastResponseDto> {
    const tokenHash = hashToken(dto.relayToken);
    const claimed = await this.capacidadRepository
      .createQueryBuilder()
      .update(RelayerCapacidad)
      .set({ consumidaEn: () => 'now()' })
      .where('token_hash = :tokenHash', { tokenHash })
      .andWhere('id_eleccion = :idEleccion', { idEleccion })
      .andWhere('consumida_en IS NULL')
      .andWhere('expira_en > now()')
      .execute();
    if (!claimed.affected) {
      throw new HttpException(
        {
          statusCode: 401,
          code: 'unknown',
          message:
            'La autorización del relayer expiró o ya se usó. Volvé a enviar el voto.',
          severity: 'warning',
          isTransient: false,
          canRetrySend: true,
          canResign: false,
        },
        401,
      );
    }

    const capacidad = await this.capacidadRepository.findOne({
      where: { tokenHash, idEleccion },
    });
    const claveIntento = capacidad?.claveIntento;

    try {
      const proof = await this.padronService.obtenerProofVotante(
        idEleccion,
        stripBytes32Prefix(dto.voterLeaf),
      );
      const { ballot } =
        await this.blockchainService.resolveElectionContracts(idEleccion);
      const txHash = await this.broadcaster.castSignedVote({
        contractAddress: ballot,
        electionId: idEleccion,
        voterLeaf: toBytes32Hex(dto.voterLeaf),
        nullifier: toBytes32Hex(dto.nullifier),
        selectionHash: toBytes32Hex(dto.selectionHash),
        candidateIds: dto.candidateIds.map((id) => BigInt(id)),
        timestamp: BigInt(dto.timestamp),
        expectedSigner: dto.expectedSigner,
        merkleProof: proof.merkleProof.map((sibling) => toBytes32Hex(sibling)),
        signature: dto.signature,
        validatorSignature: dto.validatorSignature,
      });

      if (claveIntento) {
        try {
          await this.revotePolicyService.registrarConsumo(
            idEleccion,
            claveIntento,
          );
        } catch (consumoError) {
          // El cast ya se envió: no fallar la respuesta por el contador off-chain.
          this.logger.warn(
            `registrarConsumo falló tras cast exitoso comicio=${idEleccion}: ${
              consumoError instanceof Error
                ? consumoError.message
                : String(consumoError)
            }`,
          );
        }
      }

      await this.auditLogger.logRelayerCastEnviado({ idEleccion });
      return { txHash };
    } catch (error) {
      if (!(error instanceof RelayCastFailedError) || !error.submitted) {
        await this.releaseIfStillValid(tokenHash, idEleccion);
      }
      if (error instanceof RelayCastFailedError) {
        throw new HttpException(error.relayError, error.relayError.statusCode);
      }
      throw error;
    }
  }

  private async releaseIfStillValid(
    tokenHash: string,
    idEleccion: number,
  ): Promise<void> {
    await this.capacidadRepository
      .createQueryBuilder()
      .update(RelayerCapacidad)
      .set({ consumidaEn: () => 'NULL' })
      .where('token_hash = :tokenHash', { tokenHash })
      .andWhere('id_eleccion = :idEleccion', { idEleccion })
      .andWhere('expira_en > now()')
      .execute();
  }
}
