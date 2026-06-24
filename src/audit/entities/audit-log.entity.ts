import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Eleccion } from '@/eleccion/entities/eleccion.entity';
import { TipoEventoAudit } from '@/audit/enums/tipo-evento-audit.enum';

@Entity('audit_log')
export class AuditLog {
  @PrimaryGeneratedColumn({ name: 'id_log' })
  idLog: number;

  @Column({ name: 'id_eleccion', type: 'int', nullable: true })
  idEleccion: number | null;

  @ManyToOne(() => Eleccion, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'id_eleccion' })
  eleccion?: Eleccion | null;

  @Column({ name: 'tipo_evento', type: 'enum', enum: TipoEventoAudit })
  tipoEvento: TipoEventoAudit;

  @CreateDateColumn({ name: 'timestamp', type: 'timestamptz' })
  timestamp: Date;

  @Column({ name: 'actor', type: 'varchar' })
  actor: string;

  @Column({ name: 'descripcion', type: 'varchar', nullable: true })
  descripcion: string | null;

  @Column({ name: 'hash_registro', type: 'varchar', nullable: true })
  hashRegistro: string | null;

  @Column({ name: 'ip_origen', type: 'varchar' })
  ipOrigen: string;

  @Column({ name: 'endpoint', type: 'varchar' })
  endpoint: string;

  @Column({ name: 'datos_adicionales', type: 'jsonb', nullable: true })
  datosAdicionales: Record<string, unknown> | null;
}
