import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Eleccion } from '@/eleccion/entities/eleccion.entity';

/**
 * Muestra periódica de participación on-chain para un comicio (VOTAR-433).
 *
 * Cada fila representa una lectura de AuditViewContract.getParticipationStats()
 * tomada por ParticipacionSamplerService. La serie temporal del dashboard público
 * se construye leyendo estas filas, evitando eth_getLogs y el límite de rango
 * de bloques de Alchemy free tier.
 *
 * MANTIENE PRIVACIDAD: solo se persisten contadores agregados (enteros),
 * nunca voterHash ni ningún identificador de votante.
 */
@Entity('participacion_snapshot')
@Index('idx_participacion_snapshot_eleccion_tomado_en', [
  'idEleccion',
  'tomadoEn',
])
export class ParticipacionSnapshot {
  @PrimaryGeneratedColumn({ name: 'id_snapshot' })
  idSnapshot!: number;

  @Column({ name: 'id_eleccion' })
  idEleccion!: number;

  @ManyToOne(() => Eleccion, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'id_eleccion' })
  eleccion!: Eleccion;

  /**
   * Momento en que se tomó la muestra (el cron-job del servidor, no tiempo real de
   * blockchain, se toma esta limitación para evitar estar leyendo todos los bloques de la
   * testnet de sepolia, algo muy intensivo -y además alchemy nos limita a ver solo 10 bloques para
   * atrás con el plan free).
   *
   * Tenemos que tener en cuenta que el gráfico final agrupa a los votos en buckets de una hora,
   * entonces no es necesario representar el instante exacto en que se emitió un voto, sino cuándo
   * el ParticipacionSamplerService leyó el contrato. La resolución temporal
   * depende del intervalo del sampler (SAMPLE_INTERVAL_MS).
   */
  @CreateDateColumn({ name: 'tomado_en', type: 'timestamptz' })
  tomadoEn!: Date;

  //Votantes únicos que emitieron al menos un voto (sin contar revotos).
  @Column({ name: 'total_votos', type: 'int' })
  totalVotos!: number;

  @Column({ name: 'votos_blanco', type: 'int' })
  votosBlanco!: number;

  @Column({ name: 'votos_nulo', type: 'int' })
  votosNulo!: number;

  //True en la muestra final tomada al cerrar el comicio.
  // El sampler saltea comicios que ya tienen una muestra congelada.
  @Column({ name: 'congelado', type: 'boolean', default: false })
  congelado!: boolean;
}
