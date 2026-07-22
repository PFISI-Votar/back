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

  /**
   * Firma criptográfica del bloque de auditoría anterior (encadenamiento VOTAR-370).
   * Null sólo si aún no se migró; el génesis usa AUDIT_GENESIS_HASH.
   */
  @Column({ name: 'hash_anterior', type: 'varchar', nullable: true })
  hashAnterior: string | null;

  /**
   * Identificador de terminal criptográfico (hash de IP), nunca IP en texto plano
   * en capas de visualización pública (VOTAR-370).
   * Nullable: eventos de sufragio (VOTO_EMITIDO) no deben almacenar terminal (VOTAR-379).
   */
  @Column({ name: 'ip_origen', type: 'varchar', nullable: true })
  ipOrigen: string | null;

  @Column({ name: 'endpoint', type: 'varchar' })
  endpoint: string;

  @Column({ name: 'datos_adicionales', type: 'jsonb', nullable: true })
  datosAdicionales: Record<string, unknown> | null;
}
