import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, Repository } from 'typeorm';
import { Eleccion } from '../entities/eleccion.entity';
import { EleccionEstado } from '../enums/eleccion-estado.enum';
import { AperturaComicioService } from './apertura-comicio.service';
import { EleccionGateway } from '../gateways/eleccion.gateway';

/**
 * Servicio de tareas programadas para elecciones.
 * Ejecuta la apertura automática de comicios basada en el timestamp de fechaInicio.
 */
@Injectable()
export class EleccionSchedulerService {
  private readonly logger = new Logger(EleccionSchedulerService.name);

  constructor(
    @InjectRepository(Eleccion)
    private readonly eleccionRepository: Repository<Eleccion>,
    private readonly aperturaComicioService: AperturaComicioService,
    private readonly eleccionGateway: EleccionGateway,
  ) {}

  /**
   * Verifica cada minuto si hay elecciones configuradas cuya fecha de inicio
   * ha sido alcanzada y procede a abrirlas automáticamente.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async checkAutomaticOpening(): Promise<void> {
    const now = new Date();

    try {
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
        `Detectadas ${eleccionesParaAbrir.length} elección(es) para apertura automática`,
      );

      for (const eleccion of eleccionesParaAbrir) {
        try {
          const resultado = await this.aperturaComicioService.abrirAutomatico(
            eleccion.idEleccion,
          );

          // Emitir evento WebSocket para notificar a clientes conectados
          this.eleccionGateway.emitEleccionAbierta(eleccion.idEleccion);

          this.logger.log(
            `Elección ${eleccion.idEleccion} ("${eleccion.nombre}") abierta automáticamente. ` +
              `Fecha de apertura: ${resultado.fechaApertura.toISOString()}`,
          );
        } catch (error) {
          this.logger.error(
            `Error al abrir automáticamente la elección ${eleccion.idEleccion}: ${error instanceof Error ? error.message : 'Error desconocido'}`,
            error instanceof Error ? error.stack : undefined,
          );
        }
      }
    } catch (error) {
      this.logger.error(
        `Error en checkAutomaticOpening: ${error instanceof Error ? error.message : 'Error desconocido'}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }
}
