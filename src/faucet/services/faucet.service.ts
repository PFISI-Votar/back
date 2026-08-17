import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JsonRpcProvider, Wallet, formatEther, parseEther } from 'ethers';
import { MailService } from '@/common/mail/mail.service';

interface TopUpResult {
  address: string;
  txHash: string;
  balanceAntesEth: string;
  balanceDespuesEth: string;
}

@Injectable()
export class FaucetService {
  private readonly logger = new Logger(FaucetService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly mailService: MailService,
  ) {}

  private requireRpcUrl(): string {
    const rpcUrl = this.configService.get<string>('SEPOLIA_RPC_URL');
    if (!rpcUrl) {
      throw new ServiceUnavailableException(
        'Aprovisionamiento de gas no configurado (SEPOLIA_RPC_URL).',
      );
    }
    return rpcUrl;
  }

  private requireMasterPrivateKey(): string {
    const key = this.configService.get<string>('FAUCET_MASTER_PRIVATE_KEY');
    if (!key) {
      throw new ServiceUnavailableException(
        'Aprovisionamiento de gas no configurado (FAUCET_MASTER_PRIVATE_KEY).',
      );
    }
    return key;
  }

  private getTestWalletAddresses(): string[] {
    const raw = this.configService.get<string>('TEST_WALLET_ADDRESSES') ?? '';
    return raw
      .split(',')
      .map((address) => address.trim())
      .filter((address) => address.length > 0);
  }

  private getMinBalanceEth(): string {
    return this.configService.get<string>('FAUCET_MIN_BALANCE_ETH') ?? '0.1';
  }

  private getTopUpTargetEth(): string {
    return this.configService.get<string>('FAUCET_TOPUP_TARGET_ETH') ?? '0.1';
  }

  /**
   * Revisa el balance de cada wallet de prueba y recarga desde el Faucet
   * Maestro las que estén por debajo del mínimo operativo (VOTAR-387).
   */
  async checkAndTopUpWallets(): Promise<void> {
    const provider = new JsonRpcProvider(this.requireRpcUrl());
    const masterWallet = new Wallet(this.requireMasterPrivateKey(), provider);
    const minBalance = parseEther(this.getMinBalanceEth());
    const topUpTarget = parseEther(this.getTopUpTargetEth());

    const wallets = this.getTestWalletAddresses();
    if (wallets.length === 0) {
      this.logger.warn('No hay wallets de prueba configuradas (TEST_WALLET_ADDRESSES).');
      return;
    }

    for (const address of wallets) {
      try {
        await this.topUpWalletIfNeeded(
          provider,
          masterWallet,
          address,
          minBalance,
          topUpTarget,
        );
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Error desconocido en recarga de faucet';
        this.logger.error(`Error al procesar recarga de ${address}: ${message}`);
      }
    }
  }

  private async topUpWalletIfNeeded(
    provider: JsonRpcProvider,
    masterWallet: Wallet,
    address: string,
    minBalance: bigint,
    topUpTarget: bigint,
  ): Promise<TopUpResult | null> {
    const balance = await provider.getBalance(address);
    if (balance >= minBalance) {
      return null;
    }

    const amountToSend = topUpTarget - balance;
    const masterBalance = await provider.getBalance(masterWallet.address);

    if (masterBalance < amountToSend) {
      const message = `Faucet Maestro sin fondos suficientes. Balance: ${formatEther(masterBalance)} ETH, requerido: ${formatEther(amountToSend)} ETH para recargar ${address}.`;
      this.logger.error(message);
      await this.mailService.sendMail({
        to: this.configService.get<string>('ALERT_EMAIL_TO') ?? '',
        subject: '[VOTAR] Faucet Maestro sin fondos',
        text: message,
      });
      return null;
    }

    const tx = await masterWallet.sendTransaction({
      to: address,
      value: amountToSend,
    });
    const receipt = await tx.wait();
    const balanceDespues = await provider.getBalance(address);

    this.logger.log(
      `Recarga de ${address}: tx ${receipt?.hash ?? tx.hash}, balance final ${formatEther(balanceDespues)} ETH, faucet maestro restante ${formatEther(masterBalance - amountToSend)} ETH`,
    );

    return {
      address,
      txHash: receipt?.hash ?? tx.hash,
      balanceAntesEth: formatEther(balance),
      balanceDespuesEth: formatEther(balanceDespues),
    };
  }
}