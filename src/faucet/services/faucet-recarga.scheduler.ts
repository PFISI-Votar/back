import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { FaucetService } from './faucet.service';

/**
 * Scheduler for automatic Sepolia gas top-up on test wallets (VOTAR-387).
 * Checks daily; skips a tick if a previous run is still in progress.
 */
@Injectable()
export class FaucetRecargaScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FaucetRecargaScheduler.name);
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning = false;
  private readonly CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 horas

  constructor(private readonly faucetService: FaucetService) {}

  onModuleInit() {
    this.logger.log('Iniciando scheduler de aprovisionamiento de gas (faucet)');
    this.intervalId = setInterval(() => {
      void this.runCheck();
    }, this.CHECK_INTERVAL_MS);
  }

  private async runCheck(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn(
        'Tick de faucet omitido: la corrida anterior sigue en curso.',
      );
      return;
    }
    this.isRunning = true;
    try {
      await this.faucetService.checkAndTopUpWallets();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Error desconocido en scheduler de faucet';
      this.logger.error(
        `Error en scheduler de aprovisionamiento de gas: ${message}`,
      );
    } finally {
      this.isRunning = false;
    }
  }

  onModuleDestroy() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.logger.log('Scheduler de aprovisionamiento de gas detenido');
    }
  }
}
