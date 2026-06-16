import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { EleccionEstado } from '../enums/eleccion-estado.enum';

@Entity('eleccion')
export class Eleccion {
  @ApiProperty({ example: 1, description: 'Identificador único del comicio' })
  @PrimaryGeneratedColumn({ name: 'id_eleccion' })
  idEleccion: number;

  @ApiProperty({ example: 'Elecciones UTN 2026', description: 'Nombre del comicio' })
  @Column({ name: 'nombre', type: 'varchar' })
  nombre: string;

  @ApiProperty({ example: 'Elecciones de centro estudiantil', required: false })
  @Column({ name: 'descripcion', type: 'varchar', nullable: true })
  descripcion: string;

  @ApiProperty({ example: '2026-09-01T10:00:00Z', description: 'Fecha y hora de inicio' })
  @Column({ name: 'fecha_inicio', type: 'timestamptz' })
  fechaInicio: Date;

  @ApiProperty({ example: '2026-09-01T18:00:00Z', description: 'Fecha y hora de cierre' })
  @Column({ name: 'fecha_fin', type: 'timestamptz' })
  fechaFin: Date;

  @ApiProperty({ enum: EleccionEstado, example: EleccionEstado.BORRADOR, description: 'Estado actual del comicio' })
  @Column({
    name: 'estado',
    type: 'enum',
    enum: EleccionEstado,
    default: EleccionEstado.BORRADOR,
  })
  estado: EleccionEstado;

  @ApiProperty({ example: 2, required: false, description: 'Mínimo de candidatos por lista' })
  @Column({ name: 'minimo_candidatos_por_lista', type: 'int', nullable: true })
  minimoCandidatosPorLista: number;

  @ApiProperty()
  @CreateDateColumn({ name: 'fecha_creacion', type: 'timestamptz' })
  fechaCreacion: Date;

  @ApiProperty()
  @UpdateDateColumn({ name: 'fecha_actualizacion', type: 'timestamptz' })
  fechaActualizacion: Date;
}