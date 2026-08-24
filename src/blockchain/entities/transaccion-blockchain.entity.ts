import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { Eleccion } from '@/eleccion/entities/eleccion.entity';

/**
 * VOTAR-373 — append-only index of public on-chain activity per election.
 * No FK to voter, nullifier or audit log (VOTAR-379 anonymity).
 */
@Entity('transaccion_blockchain')
@Index(['idEleccion', 'numeroBloque', 'logIndex'])
export class TransaccionBlockchain {
  @PrimaryColumn({ name: 'hash_transaccion', type: 'varchar', length: 66 })
  hashTransaccion: string;

  @Column({ name: 'id_eleccion', type: 'int' })
  idEleccion: number;

  @ManyToOne(() => Eleccion, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'id_eleccion' })
  eleccion: Eleccion;

  @Column({ name: 'numero_bloque', type: 'int' })
  numeroBloque: number;

  @Column({ name: 'marca_tiempo', type: 'timestamptz' })
  marcaTiempo: Date;

  @Column({ name: 'contrato_etiqueta', type: 'varchar', length: 64 })
  contratoEtiqueta: string;

  @Column({ name: 'nombre_evento', type: 'varchar', length: 256 })
  nombreEvento: string;

  @Column({ name: 'descripcion_legible', type: 'text' })
  descripcionLegible: string;

  @Column({ name: 'log_index', type: 'int', default: 0 })
  logIndex: number;
}
