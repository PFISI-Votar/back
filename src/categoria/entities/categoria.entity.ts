import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { Eleccion } from '../../eleccion/entities/eleccion.entity';

@Entity('categoria')
export class Categoria {
  @ApiProperty({ example: 1 })
  @PrimaryGeneratedColumn({ name: 'id_categoria' })
  idCategoria: number;

  @ApiProperty({ example: 1 })
  @Column({ name: 'id_eleccion', type: 'int' })
  idEleccion: number;

  @ApiProperty({ example: 'Presidente' })
  @Column({ name: 'nombre', type: 'varchar', length: 100 })
  nombre: string;

  @ApiProperty({ required: false })
  @Column({ name: 'descripcion', type: 'varchar', length: 500, nullable: true })
  descripcion: string;

  @ApiProperty({ example: 1 })
  @Column({ name: 'cantidad_cargos', type: 'int', default: 1 })
  cantidadCargos: number;

  @ApiProperty({ example: 1 })
  @Column({ name: 'orden', type: 'int', default: 1 })
  orden: number;

  @ApiProperty()
  @CreateDateColumn({ name: 'fecha_creacion', type: 'timestamptz' })
  fechaCreacion: Date;

  @ApiProperty()
  @UpdateDateColumn({ name: 'fecha_actualizacion', type: 'timestamptz' })
  fechaActualizacion: Date;

  @ManyToOne(() => Eleccion, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'id_eleccion' })
  eleccion: Eleccion;
}