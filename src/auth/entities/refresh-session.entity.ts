import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { encryptedColumn } from '@/common/crypto/encrypted-column.transformer';

@Entity('refresh_session')
export class RefreshSession {
  @PrimaryGeneratedColumn({ name: 'id_session' })
  idSession: number;

  @Index({ unique: true })
  @Column({ name: 'token_hash', type: 'varchar', length: 64 })
  tokenHash: string;

  @Column({ name: 'identificador_sso', type: 'varchar' })
  identificadorSso: string;

  @Column({ name: 'sub', type: 'varchar' })
  sub: string;

  /** VOTAR-498: cifrado AES-256-GCM en reposo (no se usa en where/order/like). */
  @Column({
    name: 'email',
    type: 'text',
    nullable: true,
    transformer: encryptedColumn(),
  })
  email: string | null;

  /** VOTAR-498: cifrado AES-256-GCM en reposo (no se usa en where/order/like). */
  @Column({
    name: 'nombre',
    type: 'text',
    nullable: true,
    transformer: encryptedColumn(),
  })
  nombre: string | null;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
