import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * VOTAR-497 — capacidad de un solo uso para que el relayer pague el gas.
 * Guarda el hash del token, el comicio y `clave_intento` (votanteHash) solo
 * para cooldown off-chain (VOTAR-325/328). No persiste nullifier, selección,
 * txHash ni hoja del padrón (invariante VOTAR-379): la emisión autenticada y
 * el broadcast anónimo no comparten contenido del sufragio.
 */
@Entity('relayer_capacidad')
export class RelayerCapacidad {
  @PrimaryGeneratedColumn('uuid', { name: 'id_capacidad' })
  idCapacidad: string;

  @Index({ unique: true })
  @Column({ name: 'token_hash', type: 'varchar', length: 64 })
  tokenHash: string;

  @Index()
  @Column({ name: 'id_eleccion', type: 'int' })
  idEleccion: number;

  /**
   * Ancla de cooldown off-chain (votanteHash). No es vínculo con contenido
   * del voto; no confundir con votante_hash en el esquema de desvinculación.
   */
  @Column({ name: 'clave_intento', type: 'varchar', length: 64 })
  claveIntento: string;

  @Column({ name: 'expira_en', type: 'timestamptz' })
  expiraEn: Date;

  @Column({ name: 'consumida_en', type: 'timestamptz', nullable: true })
  consumidaEn: Date | null;

  @CreateDateColumn({ name: 'emitida_en', type: 'timestamptz' })
  emitidaEn: Date;
}
