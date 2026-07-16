import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import {
  RedBlockchain,
  TipoContratoBlockchain,
} from '@/blockchain/enums/contrato-blockchain.enum';

/**
 * Registro off-chain de contratos maestros / infraestructura (VOTAR-337).
 * Persiste dirección pública + ABI para llamadas dinámicas desde NestJS/frontend
 * sin configuración manual posterior al deploy.
 */
@Entity('contrato_blockchain')
@Index(['tipo', 'red'], { unique: true })
export class ContratoBlockchain {
  @PrimaryGeneratedColumn({ name: 'id_contrato' })
  idContrato: number;

  @Column({
    name: 'tipo',
    type: 'enum',
    enum: TipoContratoBlockchain,
  })
  tipo: TipoContratoBlockchain;

  @Column({ name: 'nombre', type: 'varchar', length: 128 })
  nombre: string;

  @Column({
    name: 'direccion_contrato',
    type: 'varchar',
    length: 42,
    unique: true,
  })
  direccionContrato: string;

  /** ABI JSON completa del contrato (ethers Interface fragments). */
  @Column({ name: 'abi', type: 'jsonb' })
  abi: unknown[];

  @Column({ name: 'abi_hash', type: 'varchar', length: 66 })
  abiHash: string;

  @Column({
    name: 'red',
    type: 'enum',
    enum: RedBlockchain,
  })
  red: RedBlockchain;

  @Column({ name: 'chain_id', type: 'int' })
  chainId: number;

  @Column({
    name: 'tx_hash_despliegue',
    type: 'varchar',
    length: 66,
    nullable: true,
  })
  txHashDespliegue: string | null;

  @Column({
    name: 'fecha_despliegue',
    type: 'timestamptz',
    nullable: true,
  })
  fechaDespliegue: Date | null;

  @Column({
    name: 'verificado_etherscan',
    type: 'boolean',
    default: false,
  })
  verificadoEtherscan: boolean;

  /** Shared MerkleRootStore referenced by ElectionFactory (US-335). */
  @Column({
    name: 'merkle_root_store_address',
    type: 'varchar',
    length: 42,
    nullable: true,
  })
  merkleRootStoreAddress: string | null;

  @Column({
    name: 'admin_address',
    type: 'varchar',
    length: 42,
    nullable: true,
  })
  adminAddress: string | null;

  @CreateDateColumn({ name: 'fecha_registro', type: 'timestamptz' })
  fechaRegistro: Date;

  @UpdateDateColumn({ name: 'fecha_actualizacion', type: 'timestamptz' })
  fechaActualizacion: Date;
}
