import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { RevocacionMotivo } from '@/auth/enums/revocacion-motivo.enum';

@Entity('refresh_session')
export class RefreshSession {
  @PrimaryGeneratedColumn({ name: 'id_session' })
  idSession: number;

  @Index({ unique: true })
  @Column({ name: 'token_hash', type: 'varchar', length: 64 })
  tokenHash: string;

  @Column({ name: 'identificador_sso', type: 'varchar' })
  identificadorSso: string;

  @Index('IDX_refresh_session_sub')
  @Column({ name: 'sub', type: 'varchar' })
  sub: string;

  @Column({ name: 'email', type: 'varchar', nullable: true })
  email: string | null;

  @Column({ name: 'nombre', type: 'varchar', nullable: true })
  nombre: string | null;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  /**
   * VOTAR-492: última actividad real de la sesión (request autenticado del
   * panel). NO se actualiza en la rotación de `/auth/refresh`, para que el
   * timeout por inactividad no dependa del cliente.
   */
  @Column({
    name: 'last_activity_at',
    type: 'timestamptz',
    default: () => 'now()',
  })
  lastActivityAt: Date;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt: Date | null;

  /** VOTAR-492: motivo de la revocación; null mientras la sesión está activa. */
  @Column({
    name: 'revoked_reason',
    type: 'varchar',
    length: 32,
    nullable: true,
  })
  revokedReason: RevocacionMotivo | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
