import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Wallet } from 'ethers';
import { BlockchainService } from '@/blockchain/blockchain.service';
import {
  buildValidationDomain,
  VALIDATION_EIP712_TYPES,
  ValidationMessage,
} from '@/entidad-firmas/lib/validation-typed-data';

export const FIRMA_VALIDACION_ALGORITMO = 'ECDSA_SECP256K1_EIP712';

/**
 * VOTAR-377 — "Entidad de Firmas Digitales" (Tercero de Confianza).
 *
 * Firma EIP-712 `Validation` sobre el payload del voto con una clave institucional
 * dedicada (`VALIDATOR_PRIVATE_KEY`, distinta de `PRIVATE_KEY` operativa). El
 * dominio EIP-712 se ata al BallotContract de la elección (chainId +
 * verifyingContract), replicando `BallotContract._assertValidValidatorSignature`.
 */
@Injectable()
export class FirmaInstitucionalService {
  constructor(
    private readonly configService: ConfigService,
    private readonly blockchainService: BlockchainService,
  ) {}

  /**
   * Firma la certificación institucional de un sufragio.
   * @returns firma hex (65 bytes) + address del validador.
   */
  async firmarValidacion(
    idEleccion: number,
    message: ValidationMessage,
  ): Promise<{ firmaValidacion: string; direccionValidador: string }> {
    const wallet = this.getSigningWallet();
    const { ballot } =
      await this.blockchainService.resolveElectionContracts(idEleccion);
    const domain = buildValidationDomain(
      this.blockchainService.getChainId(),
      ballot,
    );

    const firmaValidacion = await wallet.signTypedData(
      domain,
      VALIDATION_EIP712_TYPES,
      message,
    );

    return { firmaValidacion, direccionValidador: wallet.address };
  }

  obtenerDireccionValidador(): string {
    return this.getSigningWallet().address;
  }

  private getSigningWallet(): Wallet {
    const privateKey = this.configService.get<string>('VALIDATOR_PRIVATE_KEY');
    if (!privateKey) {
      throw new ServiceUnavailableException(
        'La Entidad de Firmas Digitales no está configurada (VALIDATOR_PRIVATE_KEY).',
      );
    }
    try {
      return new Wallet(privateKey);
    } catch {
      throw new ServiceUnavailableException(
        'VALIDATOR_PRIVATE_KEY no es una clave privada válida.',
      );
    }
  }
}
