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
 * Contador off-chain de intentos de sufragio (VOTAR-328).
 * Solo almacena cantidad de emisiones — nunca la preferencia del voto.
 * `clave_intento` es un ancla opaca de sesión electoral (no se nombra
 * votante_hash para respetar el invariante de esquema VOTAR-379).
 */
@Entity('registro_intento_sufragio')
@Unique(['idEleccion', 'claveIntento'])
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
  @Column({ name: 'clave_intento', type: 'varchar', length: 64 })
  claveIntento: string;

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
