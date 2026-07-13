import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

export enum VotoConfirmacionEstado {
  RECIBIDO = 'RECIBIDO',
}

export enum VotoConfirmacionTxStatus {
  PENDIENTE = 'PENDIENTE',
  CONFIRMADA = 'CONFIRMADA',
  FALLIDA = 'FALLIDA',
}

@Entity('voto_confirmacion')
@Unique(['idEleccion', 'idempotencyKey'])
export class VotoConfirmacion {
  @PrimaryGeneratedColumn('uuid', { name: 'id_voto_confirmacion' })
  idVotoConfirmacion: string;

  @Index()
  @Column({ name: 'id_eleccion', type: 'int' })
  idEleccion: number;

  @Column({ name: 'votante_hash', type: 'varchar', length: 64 })
  votanteHash: string;

  @Column({ name: 'idempotency_key', type: 'uuid' })
  idempotencyKey: string;

  @Column({ name: 'payload_hash', type: 'varchar', length: 64 })
  payloadHash: string;

  @Column({ name: 'comprobante_hash', type: 'varchar', length: 64 })
  comprobanteHash: string;

  @Column({
    name: 'estado',
    type: 'enum',
    enum: VotoConfirmacionEstado,
    default: VotoConfirmacionEstado.RECIBIDO,
  })
  estado: VotoConfirmacionEstado;

  @CreateDateColumn({ name: 'recibido_en', type: 'timestamptz' })
  recibidoEn: Date;

  // Campos de recibo blockchain (VOTAR-360)
  @Column({ name: 'tx_hash', type: 'varchar', length: 66, nullable: true })
  txHash?: string;

  @Column({ name: 'block_number', type: 'int', nullable: true })
  blockNumber?: number;

  @Column({ name: 'tx_timestamp', type: 'timestamptz', nullable: true })
  txTimestamp?: Date;

  @Column({
    name: 'tx_status',
    type: 'enum',
    enum: VotoConfirmacionTxStatus,
    default: VotoConfirmacionTxStatus.PENDIENTE,
    nullable: true,
  })
  txStatus?: VotoConfirmacionTxStatus;

  @Column({
    name: 'codigo_verificacion_e2e',
    type: 'uuid',
    generated: 'uuid',
  })
  codigoVerificacionE2E: string;

  @Column({
    name: 'contract_address',
    type: 'varchar',
    length: 42,
    nullable: true,
  })
  contractAddress?: string;
}
