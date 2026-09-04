import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { RolAutoridad } from '@/auth/enums/rol-autoridad.enum';

@Entity('autoridad_electoral')
export class AutoridadElectoral {
  @PrimaryGeneratedColumn({ name: 'id_autoridad' })
  idAutoridad: number;

  @Column({ name: 'identificador_sso', type: 'varchar', unique: true })
  identificadorSso: string;

  @Column({ name: 'email', type: 'varchar', unique: true })
  email: string;

  @Column({ name: 'nombre', type: 'varchar' })
  nombre: string;

  @Column({ name: 'rol', type: 'enum', enum: RolAutoridad })
  rol: RolAutoridad;

  /** Secreto TOTP en base32; null si nunca se inició el setup o tras reset. */
  @Column({ name: 'totp_secret', type: 'varchar', nullable: true })
  totpSecret: string | null;

  /** true cuando el usuario confirmó el setup con un código válido. */
  @Column({ name: 'totp_enabled', type: 'boolean', default: false })
  totpEnabled: boolean;

  @CreateDateColumn({ name: 'fecha_registro', type: 'timestamptz' })
  fechaRegistro: Date;
}
