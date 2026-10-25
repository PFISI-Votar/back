import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  JoinColumn,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Eleccion } from '@/eleccion/entities/eleccion.entity';
import { SolicitudPausaTipo } from '@/eleccion/pausa/enums/solicitud-pausa-tipo.enum';
import { SolicitudPausaEstado } from '@/eleccion/pausa/enums/solicitud-pausa-estado.enum';
import { ConfirmacionPausa } from '@/eleccion/pausa/entities/confirmacion-pausa.entity';

/**
 * VOTAR-347 — pedido de pausa/reanudación de emergencia de un comicio.
 * El "n-of-m" (ninguna autoridad puede actuar en solitario) se aplica acá:
 * la transacción on-chain solo se emite cuando {@link ConfirmacionPausa}
 * alcanza el umbral configurado (PAUSE_CONFIRMATIONS_REQUIRED).
 */
@Entity('solicitud_pausa')
export class SolicitudPausa {
  @PrimaryGeneratedColumn({ name: 'id_solicitud' })
  idSolicitud!: number;

  @Column({ name: 'id_eleccion', type: 'int' })
  idEleccion!: number;

  @ManyToOne(() => Eleccion, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'id_eleccion' })
  eleccion?: Eleccion;

  @Column({ name: 'tipo', type: 'enum', enum: SolicitudPausaTipo })
  tipo!: SolicitudPausaTipo;

  @Column({ name: 'razon', type: 'text', nullable: true })
  razon!: string | null;

  @Column({
    name: 'estado',
    type: 'enum',
    enum: SolicitudPausaEstado,
    default: SolicitudPausaEstado.PENDIENTE,
  })
  estado!: SolicitudPausaEstado;

  @Column({ name: 'creado_por_hash', type: 'varchar' })
  creadoPorHash!: string;

  @CreateDateColumn({ name: 'creado_en', type: 'timestamptz' })
  creadoEn!: Date;

  @Column({ name: 'ejecutado_en', type: 'timestamptz', nullable: true })
  ejecutadoEn!: Date | null;

  @Column({ name: 'tx_hash_ballot', type: 'varchar', nullable: true })
  txHashBallot!: string | null;

  @Column({ name: 'tx_hash_vote_registry', type: 'varchar', nullable: true })
  txHashVoteRegistry!: string | null;

  @OneToMany(() => ConfirmacionPausa, (confirmacion) => confirmacion.solicitud)
  confirmaciones?: ConfirmacionPausa[];
}
