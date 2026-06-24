import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

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

  @Column({ name: 'email', type: 'varchar', nullable: true })
  email: string | null;

  @Column({ name: 'nombre', type: 'varchar', nullable: true })
  nombre: string | null;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
