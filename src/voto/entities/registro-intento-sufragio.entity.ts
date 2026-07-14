import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { Eleccion } from '@/eleccion/entities/eleccion.entity';

/**
 * Contador off-chain de intentos de sufragio por votante (VOTAR-328).
 * Solo almacena cantidad de emisiones — nunca la preferencia del voto.
 * Clave: hash de identidad del JWT (mismo ancla que el padrón), necesaria
 * porque el nullifier rota con cada billetera efímera (VOTAR-379).
 */
@Entity('registro_intento_sufragio')
@Unique(['idEleccion', 'votanteHash'])
export class RegistroIntentoSufragio {
  @PrimaryGeneratedColumn({ name: 'id_registro' })
  idRegistro: number;

  @Index()
  @Column({ name: 'id_eleccion', type: 'int' })
  idEleccion: number;

  @ManyToOne(() => Eleccion, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'id_eleccion' })
  eleccion: Eleccion;

  @Index()
  @Column({ name: 'votante_hash', type: 'varchar', length: 64 })
  votanteHash: string;

  @Column({ name: 'votos_consumidos', type: 'int', default: 0 })
  votosConsumidos: number;

  @Column({
    name: 'ultimo_intento_at',
    type: 'timestamptz',
    nullable: true,
  })
  ultimoIntentoAt: Date | null;

  @CreateDateColumn({ name: 'creado_en', type: 'timestamptz' })
  creadoEn: Date;

  @UpdateDateColumn({ name: 'actualizado_en', type: 'timestamptz' })
  actualizadoEn: Date;
}
