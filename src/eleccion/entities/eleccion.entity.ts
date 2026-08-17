import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { EleccionEstado } from '@/eleccion/enums/eleccion-estado.enum';
import { TipoVotacion } from '@/eleccion/enums/tipo-votacion.enum';
import { ConfiguracionComicio } from '@/eleccion/configuracion-comicio/entities/configuracion-comicio.entity';

export type AperturaModo = 'MANUAL' | 'AUTOMATICO';

@Entity('eleccion')
export class Eleccion {
  @ApiProperty({ example: 1, description: 'Identificador único del comicio' })
  @PrimaryGeneratedColumn({ name: 'id_eleccion' })
  idEleccion!: number;

  @ApiProperty({ example: 'Elecciones UTN 2026' })
  @Column({ name: 'nombre', type: 'varchar' })
  nombre!: string;

  @ApiProperty({ example: 'Elecciones de centro estudiantil', required: false })
  @Column({ name: 'descripcion', type: 'varchar', nullable: true })
  descripcion!: string | null;

  @ApiProperty({ example: '2026-09-01T10:00:00Z' })
  @Column({ name: 'fecha_inicio', type: 'timestamptz' })
  fechaInicio!: Date;

  @ApiProperty({ example: '2026-09-01T18:00:00Z' })
  @Column({ name: 'fecha_fin', type: 'timestamptz' })
  fechaFin!: Date;

  @ApiProperty({ enum: EleccionEstado, example: EleccionEstado.BORRADOR })
  @Column({
    name: 'estado',
    type: 'enum',
    enum: EleccionEstado,
    default: EleccionEstado.BORRADOR,
  })
  estado!: EleccionEstado;

  @ApiProperty({ enum: TipoVotacion, example: TipoVotacion.POR_LISTA })
  @Column({ name: 'tipo_votacion', type: 'enum', enum: TipoVotacion })
  tipoVotacion!: TipoVotacion;

  @ApiProperty({ example: 2, required: false })
  @Column({ name: 'minimo_candidatos_por_lista', type: 'int', nullable: true })
  minimoCandidatosPorLista!: number | null;

  @ApiProperty()
  @CreateDateColumn({ name: 'fecha_creacion', type: 'timestamptz' })
  fechaCreacion!: Date;

  @ApiProperty()
  @UpdateDateColumn({ name: 'fecha_actualizacion', type: 'timestamptz' })
  fechaActualizacion!: Date;

  @OneToOne(() => ConfiguracionComicio, (config) => config.eleccion)
  configuracionComicio?: ConfiguracionComicio;

  /**
   * Snapshot de la apertura real del comicio (VOTAR-374, Acta de Apertura).
   * `aperturaActorNombre`/`Rol` provienen de AUTORIDAD_ELECTORAL, que no
   * está sujeta al anonimato de Ley 25.326 (eso aplica solo a VOTANTE/VOTO).
   * En apertura automática (scheduler) quedan en null: no hay responsable
   * humano que registrar.
   */
  @ApiProperty({ required: false, nullable: true })
  @Column({ name: 'apertura_real_en', type: 'timestamptz', nullable: true })
  aperturaRealEn!: Date | null;

  @ApiProperty({
    required: false,
    nullable: true,
    example: 'MANUAL',
  })
  @Column({ name: 'apertura_modo', type: 'varchar', nullable: true })
  aperturaModo!: AperturaModo | null;

  @ApiProperty({ required: false, nullable: true })
  @Column({ name: 'apertura_actor_nombre', type: 'varchar', nullable: true })
  aperturaActorNombre!: string | null;

  @ApiProperty({ required: false, nullable: true })
  @Column({ name: 'apertura_actor_rol', type: 'varchar', nullable: true })
  aperturaActorRol!: string | null;
}
