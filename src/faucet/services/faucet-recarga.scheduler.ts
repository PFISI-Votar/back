import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FaucetService } from './faucet.service';

/**
 * Scheduler for automatic Sepolia gas top-up on test wallets (VOTAR-387).
 * Checks daily; skips a tick if a previous run is still in progress.
 *
 * Gated by FAUCET_ENABLED (default false): sin el flag, cada instancia
 * local del backend dispararía el mismo job contra el Faucet Maestro
 * compartido, con riesgo de nonce compartido entre corridas simultáneas.
 * Habilitar solo en el entorno donde corresponda correr el chequeo real.
 */
@Injectable()
export class FaucetRecargaScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FaucetRecargaScheduler.name);
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning = false;
  private readonly CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 horas

  constructor(
    private readonly faucetService: FaucetService,
    private readonly configService: ConfigService,
  ) {}

  onModuleInit() {
    const enabled = this.configService.get<boolean>('FAUCET_ENABLED');
    if (!enabled) {
      this.logger.log(
        'Scheduler de aprovisionamiento de gas deshabilitado (FAUCET_ENABLED=false).',
      );
      return;
    }

    this.logger.log('Iniciando scheduler de aprovisionamiento de gas (faucet)');
    // Corrida inmediata al boot: evita depender de que el proceso quede
    // 24hs corriendo sin cortes para que se ejecute el primer chequeo.
    void this.runCheck();
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
