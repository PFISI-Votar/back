import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual } from 'typeorm';
import { Eleccion } from '@/eleccion/entities/eleccion.entity';
import { EleccionEstado } from '@/eleccion/enums/eleccion-estado.enum';
import { CierreComicioService } from '@/eleccion/services/cierre-comicio.service';

/**
 * Scheduler for automatic election closing (VOTAR-321 UAT-02).
 * Checks every minute for open elections whose fechaFin has elapsed.
 */
@Injectable()
export class CierreAutomaticoScheduler implements OnModuleInit {
  private readonly logger = new Logger(CierreAutomaticoScheduler.name);
  private intervalId: NodeJS.Timeout | null = null;
  private readonly CHECK_INTERVAL_MS = 60 * 1000;

  constructor(
    @InjectRepository(Eleccion)
    private readonly eleccionRepository: Repository<Eleccion>,
    private readonly cierreComicioService: CierreComicioService,
  ) {}

  onModuleInit() {
    this.logger.log('Iniciando scheduler de cierre automático de comicios');
    this.startScheduler();
  }

  private startScheduler() {
    this.intervalId = setInterval(() => {
      void this.checkAndCloseElections();
    }, this.CHECK_INTERVAL_MS);
  }

  private async checkAndCloseElections(): Promise<void> {
    try {
      const now = new Date();

      const eleccionesParaCerrar = await this.eleccionRepository.find({
        where: {
          estado: EleccionEstado.ABIERTA,
          fechaFin: LessThanOrEqual(now),
        },
      });

      if (eleccionesParaCerrar.length === 0) {
        return;
      }

      this.logger.log(
        `Encontradas ${eleccionesParaCerrar.length} elección(es) para cierre automático`,
      );

      for (const eleccion of eleccionesParaCerrar) {
        try {
          await this.cierreComicioService.cerrarAutomatico(eleccion.idEleccion);
          this.logger.log(
            `Comicio ${eleccion.idEleccion} (${eleccion.nombre}) cerrado automáticamente`,
          );
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : 'Error desconocido en cierre automático';
          this.logger.error(
            `Error al cerrar automáticamente comicio ${eleccion.idEleccion}: ${message}`,
          );
        }
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Error desconocido en scheduler';
      this.logger.error(`Error en scheduler de cierre automático: ${message}`);
    }
  }

  onModuleDestroy() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.logger.log('Scheduler de cierre automático detenido');
    }
  }
}
