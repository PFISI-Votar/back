import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { EleccionGateway } from '@/eleccion/gateways/eleccion.gateway';
import { EscrutinioService } from '@/escrutinio/services/escrutinio.service';

const POLL_INTERVAL_MS = 4_000;

/**
 * Scheduled on-chain tally polling for open elections (VOTAR-364).
 * Single poller per process — clients consume cache/REST/WS, never Sepolia directly.
 */
@Injectable()
export class EscrutinioPollerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EscrutinioPollerService.name);
  private intervalId: NodeJS.Timeout | null = null;
  private isTickRunning = false;

  constructor(
    private readonly escrutinioService: EscrutinioService,
    private readonly eleccionGateway: EleccionGateway,
  ) {}

  onModuleInit(): void {
    this.logger.log(
      `Iniciando poller de escrutinio (intervalo ${POLL_INTERVAL_MS}ms)`,
    );
    this.intervalId = setInterval(() => {
      void this.tick();
    }, POLL_INTERVAL_MS);
  }

  onModuleDestroy(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      this.logger.log('Poller de escrutinio detenido');
    }
  }

  private async tick(): Promise<void> {
    if (this.isTickRunning) {
      return;
    }
    this.isTickRunning = true;
    try {
      const ids = await this.escrutinioService.listarComiciosParaPolling();
      for (const idEleccion of ids) {
        try {
          const { changed, snapshot } =
            await this.escrutinioService.refreshAndDetectChange(idEleccion);
          if (changed) {
            this.eleccionGateway.emitResultadosActualizados({
              idEleccion,
              actualizadoEn: snapshot.actualizadoEn,
              totalVotos: snapshot.participacion.totalVotos,
            });
          }
        } catch (error) {
          const message =
            error instanceof Error ? error.message : 'Error desconocido';
          this.logger.warn(
            `Poller escrutinio falló para comicio ${idEleccion}: ${message}`,
          );
        }
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Error desconocido';
      this.logger.error(`Error en tick del poller de escrutinio: ${message}`);
    } finally {
      this.isTickRunning = false;
    }
  }
}
