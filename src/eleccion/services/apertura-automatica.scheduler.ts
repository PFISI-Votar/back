import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual } from 'typeorm';
import { Eleccion } from '@/eleccion/entities/eleccion.entity';
import { EleccionEstado } from '@/eleccion/enums/eleccion-estado.enum';
import { AperturaComicioService } from '@/eleccion/services/apertura-comicio.service';

/**
 * Scheduler for automatic election opening (VOTAR-320 UAT-03).
 * Checks every minute for elections that should be opened automatically.
 */
@Injectable()
export class AperturaAutomaticaScheduler implements OnModuleInit {
  private readonly logger = new Logger(AperturaAutomaticaScheduler.name);
  private intervalId: NodeJS.Timeout | null = null;
  private readonly CHECK_INTERVAL_MS = 60 * 1000; // Check every 1 minute

  constructor(
    @InjectRepository(Eleccion)
    private readonly eleccionRepository: Repository<Eleccion>,
    private readonly aperturaComicioService: AperturaComicioService,
  ) {}

  onModuleInit() {
    this.logger.log('Iniciando scheduler de apertura automática de comicios');
    this.startScheduler();
  }

  private startScheduler() {
    this.intervalId = setInterval(async () => {
      await this.checkAndOpenElections();
    }, this.CHECK_INTERVAL_MS);
  }

  private async checkAndOpenElections(): Promise<void> {
    try {
      const now = new Date();

      // Find elections in CONFIGURADA state where fechaInicio has been reached
      const eleccionesParaAbrir = await this.eleccionRepository.find({
        where: {
          estado: EleccionEstado.CONFIGURADA,
          fechaInicio: LessThanOrEqual(now),
        },
      });

      if (eleccionesParaAbrir.length === 0) {
        return;
      }

      this.logger.log(
        `Encontradas ${eleccionesParaAbrir.length} elección(es) para apertura automática`,
      );

      for (const eleccion of eleccionesParaAbrir) {
        try {
          await this.aperturaComicioService.abrirAutomatico(
            eleccion.idEleccion,
          );
          this.logger.log(
            `Comicio ${eleccion.idEleccion} (${eleccion.nombre}) abierto automáticamente`,
          );
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : 'Error desconocido en apertura automática';
          this.logger.error(
            `Error al abrir automáticamente comicio ${eleccion.idEleccion}: ${message}`,
          );
        }
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Error desconocido en scheduler';
      this.logger.error(
        `Error en scheduler de apertura automática: ${message}`,
      );
    }
  }

  onModuleDestroy() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.logger.log('Scheduler de apertura automática detenido');
    }
  }
}
