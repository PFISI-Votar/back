import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { RolAutoridad } from '@/auth/enums/rol-autoridad.enum';
import { encryptedColumn } from '@/common/crypto/encrypted-column.transformer';

@Entity('autoridad_electoral')
export class AutoridadElectoral {
  @PrimaryGeneratedColumn({ name: 'id_autoridad' })
  idAutoridad: number;

  @Column({ name: 'identificador_sso', type: 'varchar', unique: true })
  identificadorSso: string;

  /**
   * VOTAR-498: se mantiene en claro deliberadamente — es la clave de
   * búsqueda del login SSO (`AuthService.findOrCreateAutoridad`, `where:
   * [{ identificadorSso }, { email }]`). Cifrarla exigiría un blind index
   * (hash determinístico indexado) para no perder esa búsqueda; queda
   * documentado como excepción cubierta por el cifrado de volumen/disco.
   */
  @Column({ name: 'email', type: 'varchar', unique: true })
  email: string;

  /** VOTAR-498: cifrado AES-256-GCM en reposo (no se usa en where/order/like). */
  @Column({ name: 'nombre', type: 'text', transformer: encryptedColumn() })
  nombre: string;

  @Column({ name: 'rol', type: 'enum', enum: RolAutoridad })
  rol: RolAutoridad;

  /**
   * Secreto TOTP en base32; null si nunca se inició el setup o tras reset.
   * VOTAR-498: cifrado AES-256-GCM en reposo — es el secreto compartido del
   * segundo factor, el objetivo de mayor valor de este hardening.
   */
  @Column({
    name: 'totp_secret',
    type: 'text',
    nullable: true,
    transformer: encryptedColumn(),
  })
  totpSecret: string | null;

  /** true cuando el usuario confirmó el setup con un código válido. */
  @Column({ name: 'totp_enabled', type: 'boolean', default: false })
  totpEnabled: boolean;

  @CreateDateColumn({ name: 'fecha_registro', type: 'timestamptz' })
  fechaRegistro: Date;
}
