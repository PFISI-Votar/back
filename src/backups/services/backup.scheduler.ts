import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BACKUP_HOUR_DEFAULT } from '../backup.constants';
import { msUntilNextBackupHour } from '../backup.retention';
import { BackupService } from './backup.service';

/**
 * Scheduler diario de respaldos PostgreSQL cifrados (VOTAR-388).
 * Gated por BACKUP_ENABLED (default false) para no disparar dumps
 * en cada instancia local de desarrollo.
 */
@Injectable()
export class BackupScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BackupScheduler.name);
  private timeoutId: NodeJS.Timeout | null = null;
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning = false;
  private readonly DAY_MS = 24 * 60 * 60 * 1000;

  constructor(
    private readonly backupService: BackupService,
    private readonly configService: ConfigService,
  ) {}

  onModuleInit() {
    const enabled = this.configService.get<boolean>('BACKUP_ENABLED');
    if (!enabled) {
      this.logger.log(
        'Scheduler de respaldos PostgreSQL deshabilitado (BACKUP_ENABLED=false).',
      );
      return;
    }

    const hour =
      this.configService.get<number>('BACKUP_HOUR') ?? BACKUP_HOUR_DEFAULT;
    const delay = msUntilNextBackupHour(hour);
    this.logger.log(
      `Scheduler de respaldos armado: próxima corrida en ~${Math.round(delay / 60_000)} min (hora local ${hour}:00).`,
    );

    this.timeoutId = setTimeout(() => {
      void this.runBackupTick();
      this.intervalId = setInterval(() => {
        void this.runBackupTick();
      }, this.DAY_MS);
    }, delay);
  }

  private async runBackupTick(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn(
        'Tick de backup omitido: la corrida anterior sigue en curso.',
      );
      return;
    }
    this.isRunning = true;
    try {
      await this.backupService.runBackup();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Error desconocido en scheduler de backup';
      this.logger.error(`Error en scheduler de respaldos: ${message}`);
    } finally {
      this.isRunning = false;
    }
  }

  onModuleDestroy() {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
    }
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
    this.logger.log('Scheduler de respaldos PostgreSQL detenido');
  }
}
