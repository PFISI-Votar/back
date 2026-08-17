import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { SolicitudPausa } from '@/eleccion/pausa/entities/solicitud-pausa.entity';

/**
 * VOTAR-347 — confirmación individual de una autoridad distinta sobre un
 * {@link SolicitudPausa} pendiente. `actorHash` reutiliza el mismo esquema de
 * ofuscación SHA-256 que `AuditLoggerService.ofuscarOperador`.
 */
@Entity('confirmacion_pausa')
export class ConfirmacionPausa {
  @PrimaryGeneratedColumn({ name: 'id_confirmacion' })
  idConfirmacion!: number;

  @Column({ name: 'id_solicitud', type: 'int' })
  idSolicitud!: number;

  @ManyToOne(() => SolicitudPausa, (solicitud) => solicitud.confirmaciones, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'id_solicitud' })
  solicitud?: SolicitudPausa;

  @Column({ name: 'actor_hash', type: 'varchar' })
  actorHash!: string;

  @CreateDateColumn({ name: 'confirmado_en', type: 'timestamptz' })
  confirmadoEn!: Date;
}
