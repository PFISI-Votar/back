import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BlockchainService } from '@/blockchain/blockchain.service';
import { ParticipacionSnapshot } from '@/dashboard-publico/entities/participacion-snapshot.entity';
import { Eleccion } from '@/eleccion/entities/eleccion.entity';
import { EleccionEstado } from '@/eleccion/enums/eleccion-estado.enum';

/**
 * Intervalo entre muestras: 5 minutos.
 *
 * En el gráfico de las métricas se analizan las estadísticas de gente que votó cada una hora (15 a 16,
 * 16 a 17, etc), asique 5 minutos da 12 muestras por bucket, más que suficiente para una curva suave. 
 * 
 * Votaciones cortas (< 1 hora) acumulan todos sus votos en un único bucket horario, lo cual 
 * es correcto, ya que en comicios breves no tiene sentido un análisis de afluencia por franja.
 */
const SAMPLE_INTERVAL_MS = 5 * 60 * 1_000; 

/**
 * VOTAR-433: samplea getParticipationStats() en el contrato cada 5 minutos
 * para cada comicio abierto y persiste el resultado en participacion_snapshot.
 *
 * Esto reemplaza el uso de eth_getLogs (getVoteCastTimeline) para construir
 * la curva temporal del dashboard público, eliminando la dependencia del
 * límite de rango de bloques del plan gratuito de Alchemy (que dejaba ver 10 bloques para 
 * atrás de Sepolia, donde se genera aprox 1 bloque cada 10 segundos. En una votación de una
 * hora, habría que revisar 360 bloques -donde capaz solo 3 son de nuestro sistema- y encima
 * tendríamos que hacer 36 peticiones a Alchemy; y esto por cada usuario que consulta
 * el dashboard: un montón e innecesario)
 *
 * Un único intervalo procesa todos los comicios abiertos secuencialmente,
 * igual que EscrutinioPollerService. No se crea un job por comicio.
 */
@Injectable()
export class ParticipacionSamplerService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(ParticipacionSamplerService.name);
  private intervalId: NodeJS.Timeout | null = null;
  private isTickRunning = false;

  constructor(
    @InjectRepository(ParticipacionSnapshot)
    private readonly snapshotRepository: Repository<ParticipacionSnapshot>,
    @InjectRepository(Eleccion)
    private readonly eleccionRepository: Repository<Eleccion>,
    private readonly blockchainService: BlockchainService,
  ) {}

  onModuleInit(): void {
    this.logger.log(`Iniciando sampler de participación (intervalo ${SAMPLE_INTERVAL_MS / 1000}s)` );
    this.intervalId = setInterval(() => {
      void this.tick();
    }, SAMPLE_INTERVAL_MS);
  }

  onModuleDestroy(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      this.logger.log('Sampler de participación detenido');
    }
  }

  /**
   * Toma una muestra final con congelado=true al cerrar el comicio.
   * Llamado explícitamente por CierreComicioService para capturar
   * los votos del último intervalo antes de que el sampler lo saltee.
   */
  async tomarMuestraFinal(idEleccion: number): Promise<void> {
    await this.samplearComicio(idEleccion, true);
  }

  private async tick(): Promise<void> {
    if (this.isTickRunning) {
      return;
    }
    this.isTickRunning = true;
    try {
      const comicios = await this.eleccionRepository.find({
        where: { estado: EleccionEstado.ABIERTA },
        select: ['idEleccion'],
      });

      for (const comicio of comicios) {
        try {
          await this.samplearComicio(comicio.idEleccion, false);
        } catch (error) {
          const message =
            error instanceof Error ? error.message : 'Error desconocido';
          this.logger.warn(
            `Sampler falló para comicio ${comicio.idEleccion}: ${message}`,
          );
        }
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Error desconocido';
      this.logger.error(`Error en tick del sampler de participación: ${message}`);
    } finally {
      this.isTickRunning = false;
    }
  }

  private async samplearComicio(
    idEleccion: number,
    congelado: boolean,
  ): Promise<void> {
    
    // Si ya existe una muestra congelada, el comicio está cerrado: no samplear más.
    const yaCongelado = await this.snapshotRepository.existsBy({
      idEleccion,
      congelado: true,
    });
    if (yaCongelado) {
      return;
    }

    const stats =
      await this.blockchainService.getParticipationStats(idEleccion);

    await this.snapshotRepository.save(
      this.snapshotRepository.create({
        idEleccion,
        totalVotos: stats.totalVotes,
        votosBlanco: stats.blankVotes,
        votosNulo: stats.nullVotes,
        congelado,
      }),
    );

    this.logger.debug(
      `Comicio ${idEleccion}: muestra guardada ` +
        `(totalVotos=${stats.totalVotes}, congelado=${congelado})`,
    );
  }
}