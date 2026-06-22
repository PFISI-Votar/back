import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  OneToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { Eleccion } from '../../eleccion/entities/eleccion.entity';
import { NovedadPadronDto } from '../dto/novedad-padron.dto';
import { PadronEstado } from '../enums/padron-estado.enum';
import { PadronVotante } from './padron-votante.entity';

/**
 * Metadata del padrón electoral. Relación 1:1 con ELECCION (la columna FK
 * `id_eleccion` es única por la naturaleza del @OneToOne + @JoinColumn).
 * No contiene datos personales: la identidad vive hasheada en PADRON_VOTANTE.
 */
@Entity('padron_electoral')
export class PadronElectoral {
  @PrimaryGeneratedColumn({ name: 'id_padron' })
  idPadron: number;

  @OneToOne(() => Eleccion, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'id_eleccion' })
  eleccion: Eleccion;

  @Column({ name: 'total_votantes_habilitados', type: 'int' })
  totalVotantesHabilitados: number;

  @Column({ name: 'hash_padron', type: 'varchar', length: 64 })
  hashPadron: string;

  @Column({
    name: 'estado',
    type: 'enum',
    enum: PadronEstado,
    default: PadronEstado.BORRADOR,
  })
  estado: PadronEstado;

  @CreateDateColumn({ name: 'fecha_generacion', type: 'timestamptz' })
  fechaGeneracion: Date;

  /** Filas de datos (no vacías) leídas del CSV en la importación (US-331). */
  @Column({ name: 'total_procesados', type: 'int', default: 0 })
  totalProcesados: number;

  /** Filas omitidas (defectuosas o duplicadas) durante la importación. */
  @Column({ name: 'total_omitidos', type: 'int', default: 0 })
  totalOmitidos: number;

  /**
   * Registro de novedades de la importación, para re-descarga del reporte de
   * auditoría. Sólo línea + tipo + motivo: nunca PII (Ley 25.326).
   */
  @Column({ name: 'novedades', type: 'jsonb', default: () => "'[]'" })
  novedades: NovedadPadronDto[];

  @OneToMany(() => PadronVotante, (votante) => votante.padron, {
    cascade: true,
  })
  votantes: PadronVotante[];
}
