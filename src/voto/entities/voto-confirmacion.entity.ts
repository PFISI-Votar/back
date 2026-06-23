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

@Entity('voto_confirmacion')
@Unique(['idEleccion', 'votanteHash'])
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
}
