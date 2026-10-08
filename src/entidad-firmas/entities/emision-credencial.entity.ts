import {
  Column,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

/**
 * VOTAR-377 — contador off-chain de credenciales de validación emitidas a un
 * votante para una elección. Sirve sólo para poner un tope generoso a la emisión
 * (tolerando reintentos / F5); NO es el mecanismo anti-doble-voto (ese es el
 * nullifier on-chain, VOTAR-353/341).
 *
 * Invariante de anonimato (VOTAR-379): esta tabla NO guarda `commit_credencial`,
 * `nullifier` ni `selection_hash`. No comparte ninguna columna ni relación con
 * `credencial_validacion`, de modo que el backend no puede reconstruir qué
 * credencial anónima pertenece a qué votante. La columna reusa el nombre
 * `hash_hoja` de `PADRON_VOTANTE` (mismo valor, keccak256 del padrón — nunca se
 * nombra `votante_hash` para respetar el invariante de esquema VOTAR-379).
 * `ultima_emision_en` se redondea al bucket de 5 minutos.
 */
@Entity('emision_credencial')
@Unique('UQ_emision_credencial_eleccion_hoja', ['idEleccion', 'hashHoja'])
export class EmisionCredencial {
  @PrimaryGeneratedColumn('uuid', { name: 'id_emision' })
  idEmision: string;

  @Index()
  @Column({ name: 'id_eleccion', type: 'int' })
  idEleccion: number;

  /** keccak256(dni:email) — hash de hoja del padrón, sin prefijo 0x. */
  @Column({ name: 'hash_hoja', type: 'varchar', length: 64 })
  hashHoja: string;

  @Column({ name: 'credenciales_emitidas', type: 'smallint', default: 0 })
  credencialesEmitidas: number;

  @UpdateDateColumn({ name: 'ultima_emision_en', type: 'timestamptz' })
  ultimaEmisionEn: Date;
}
