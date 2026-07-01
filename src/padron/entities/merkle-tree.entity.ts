import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { PadronElectoral } from './padron-electoral.entity';
import { MerkleTreeEstado } from '../enums/merkle-tree-estado.enum';
import type { MerkleTreeDump } from '../types/merkle-tree-dump.type';

/**
 * Árbol de Merkle del padrón electoral. Persiste la raíz y el dump serializado
 * del árbol (StandardMerkleTree) para reconstruir proofs on-demand (VOTAR-334).
 */
@Entity('merkle_tree')
export class MerkleTree {
  @PrimaryGeneratedColumn({ name: 'id_merkle_tree' })
  idMerkleTree: number;

  @OneToOne(() => PadronElectoral, (padron) => padron.merkleTree, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'id_padron' })
  padron: PadronElectoral;

  @Column({ name: 'merkle_root', type: 'varchar', length: 66 })
  merkleRoot: string;

  @Column({ name: 'total_hojas', type: 'int' })
  totalHojas: number;

  @Column({ name: 'version', type: 'int', default: 1 })
  version: number;

  @Column({
    name: 'estado',
    type: 'enum',
    enum: MerkleTreeEstado,
    default: MerkleTreeEstado.GENERADO,
  })
  estado: MerkleTreeEstado;

  @Column({ name: 'tree_dump', type: 'jsonb' })
  treeDump: MerkleTreeDump;

  @CreateDateColumn({ name: 'fecha_generacion', type: 'timestamptz' })
  fechaGeneracion: Date;

  @Column({
    name: 'tx_hash_publicacion',
    type: 'varchar',
    length: 66,
    nullable: true,
  })
  txHashPublicacion: string | null;

  @Column({ name: 'numero_bloque', type: 'int', nullable: true })
  numeroBloque: number | null;

  @Column({
    name: 'fecha_publicacion_on_chain',
    type: 'timestamptz',
    nullable: true,
  })
  fechaPublicacionOnChain: Date | null;

  @Column({
    name: 'direccion_contrato',
    type: 'varchar',
    length: 42,
    nullable: true,
  })
  direccionContrato: string | null;
}
