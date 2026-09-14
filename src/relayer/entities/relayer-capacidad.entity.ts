import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * VOTAR-497 — capacidad de un solo uso para que el relayer pague el gas.
 * Guarda únicamente el hash del token y el comicio. No persiste votante_hash,
 * hoja del padrón, nullifier, selección ni txHash (invariante VOTAR-379):
 * la emisión autenticada y el broadcast anónimo no comparten fila.
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

  @Column({ name: 'expira_en', type: 'timestamptz' })
  expiraEn: Date;

  @Column({ name: 'consumida_en', type: 'timestamptz', nullable: true })
  consumidaEn: Date | null;

  @CreateDateColumn({ name: 'emitida_en', type: 'timestamptz' })
  emitidaEn: Date;
}
