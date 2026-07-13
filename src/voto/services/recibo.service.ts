import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Wallet } from 'ethers';
import { Repository } from 'typeorm';
import { BlockchainService } from '@/blockchain/blockchain.service';
import { Eleccion } from '@/eleccion/entities/eleccion.entity';
import {
  ClavePublicaReciboResponseDto,
  FirmarReciboDto,
  FirmarReciboResponseDto,
} from '@/voto/dto/firmar-recibo.dto';
import { VerificarReciboResponseDto } from '@/voto/dto/verificar-recibo-response.dto';
import {
  buildReciboCanonicalPayload,
  TX_HASH_REGEX,
} from '@/voto/lib/recibo-canonical';

const FIRMA_ALGORITMO = 'ECDSA_SECP256K1_SHA256';

@Injectable()
export class ReciboService {
  constructor(
    private readonly blockchainService: BlockchainService,
    private readonly configService: ConfigService,
    @InjectRepository(Eleccion)
    private readonly eleccionRepository: Repository<Eleccion>,
  ) {}

  async verificarPorTxHash(
    txHash: string,
  ): Promise<VerificarReciboResponseDto> {
    const normalized = this.normalizeTxHash(txHash);
    const participation =
      await this.blockchainService.getVoteParticipationByTxHash(normalized);

    const eleccion = await this.eleccionRepository.findOne({
      where: { idEleccion: participation.idEleccion },
    });

    const nombreEleccion =
      eleccion?.nombre ?? `Elección #${participation.idEleccion}`;
    const timestamp = participation.timestamp.toISOString();

    const networkName = this.blockchainService.getNetworkDisplayName();

    return {
      confirmado: true,
      idEleccion: participation.idEleccion,
      nombreEleccion,
      txHash: participation.txHash,
      blockNumber: participation.blockNumber,
      timestamp,
      contractAddress: participation.contractAddress,
      explorerUrl: this.blockchainService.buildExplorerUrl(
        participation.txHash,
      ),
      estadoTx: 'CONFIRMADA',
      // VOTAR-366 UAT-01: inclusion confirmation without revealing the vote.
      mensaje: `Su voto ha sido incluido con éxito en el bloque número ${participation.blockNumber} de la blockchain de ${networkName}`,
    };
  }

  async firmarRecibo(dto: FirmarReciboDto): Promise<FirmarReciboResponseDto> {
    const normalizedTxHash = this.normalizeTxHash(dto.txHash);
    const participation =
      await this.blockchainService.getVoteParticipationByTxHash(
        normalizedTxHash,
      );

    if (participation.idEleccion !== dto.idEleccion) {
      throw new BadRequestException(
        'El idEleccion no coincide con el evento SignedVoteCast de la transacción.',
      );
    }

    if (participation.blockNumber !== dto.blockNumber) {
      throw new BadRequestException(
        'El blockNumber no coincide con la confirmación on-chain de la transacción.',
      );
    }

    const wallet = this.getSigningWallet();
    const payloadCanonico = buildReciboCanonicalPayload({
      idEleccion: dto.idEleccion,
      txHash: normalizedTxHash,
      blockNumber: dto.blockNumber,
      timestamp: dto.timestamp,
    });

    const firmaDigital = await wallet.signMessage(payloadCanonico);

    return {
      firmaDigital,
      algoritmo: FIRMA_ALGORITMO,
      clavePublica: wallet.address,
      payloadCanonico,
    };
  }

  obtenerClavePublica(): ClavePublicaReciboResponseDto {
    const wallet = this.getSigningWallet();
    return {
      algoritmo: FIRMA_ALGORITMO,
      clavePublica: wallet.address,
    };
  }

  private normalizeTxHash(txHash: string): string {
    const trimmed = txHash.trim();
    if (!TX_HASH_REGEX.test(trimmed)) {
      throw new BadRequestException(
        'txHash debe ser un hash Ethereum válido (0x + 64 caracteres hex).',
      );
    }
    return trimmed.toLowerCase();
  }

  private getSigningWallet(): Wallet {
    const privateKey = this.configService.get<string>(
      'RECIBO_SIGNING_PRIVATE_KEY',
    );
    if (!privateKey) {
      throw new ServiceUnavailableException(
        'La firma de recibos no está configurada (RECIBO_SIGNING_PRIVATE_KEY).',
      );
    }
    try {
      return new Wallet(privateKey);
    } catch {
      throw new ServiceUnavailableException(
        'RECIBO_SIGNING_PRIVATE_KEY no es una clave privada válida.',
      );
    }
  }
}
