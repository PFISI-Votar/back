import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * VOTAR-377 — voucher de elegibilidad de un solo uso emitido por la "Entidad de
 * Firmas Digitales" en la FASE 1 (autenticada).
 *
 * Invariante de anonimato (Ley 25.326 / VOTAR-379): esta tabla NO guarda
 * `votante_hash`, `nullifier`, `selection_hash` ni `tx_hash`. El único vínculo con
 * el votante es el `commit` (keccak256 de un secreto que sólo vive en el RAM del
 * navegador), que el cliente revela recién en la FASE 2 anónima. `emitida_en` se
 * redondea al bucket de 5 minutos para que el timestamp no permita correlacionar
 * esta fila con `emision_credencial`.
 */
export enum EstadoCredencialValidacion {
  EMITIDA = 'EMITIDA',
  CONSUMIDA = 'CONSUMIDA',
  EXPIRADA = 'EXPIRADA',
}

@Entity('credencial_validacion')
@Index('IDX_credencial_validacion_lookup', ['idEleccion', 'estado', 'expiraEn'])
export class CredencialValidacion {
  @PrimaryGeneratedColumn('uuid', { name: 'id_credencial' })
  idCredencial: string;

  @Index()
  @Column({ name: 'id_eleccion', type: 'int' })
  idEleccion: number;

  /** keccak256(secreto) — 0x + 64 hex. Único: un secreto ⇒ una credencial. */
  @Index({ unique: true })
  @Column({ name: 'commit_credencial', type: 'varchar', length: 66 })
  commitCredencial: string;

  @Column({
    name: 'estado',
    type: 'enum',
    enum: EstadoCredencialValidacion,
    default: EstadoCredencialValidacion.EMITIDA,
  })
  estado: EstadoCredencialValidacion;

  /** Instante (bucket 5 min) tras el cual la credencial ya no puede consumirse. */
  @Column({ name: 'expira_en', type: 'timestamptz' })
  expiraEn: Date;

  @CreateDateColumn({ name: 'emitida_en', type: 'timestamptz' })
  emitidaEn: Date;
}
