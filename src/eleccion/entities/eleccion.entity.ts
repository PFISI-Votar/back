import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
} from 'typeorm';
import { EleccionEstado } from '@/eleccion/enums/eleccion-estado.enum';
import { TipoVotacion } from '@/eleccion/enums/tipo-votacion.enum';
import { ConfiguracionComicio } from '@/eleccion/configuracion-comicio/entities/configuracion-comicio.entity';

@Entity('eleccion')
export class Eleccion {
  @PrimaryGeneratedColumn({ name: 'id_eleccion' })
  idEleccion: number;

  @Column({ name: 'nombre', type: 'varchar' })
  nombre: string;

  @Column({ name: 'descripcion', type: 'varchar', nullable: true })
  descripcion: string | null;

  @Column({ name: 'fecha_inicio', type: 'timestamptz' })
  fechaInicio: Date;

  @Column({ name: 'fecha_fin', type: 'timestamptz' })
  fechaFin: Date;

  @Column({
    name: 'estado',
    type: 'enum',
    enum: EleccionEstado,
    default: EleccionEstado.BORRADOR,
  })
  estado: EleccionEstado;

  @Column({
    name: 'tipo_votacion',
    type: 'enum',
    enum: TipoVotacion,
  })
  tipoVotacion: TipoVotacion;

  @Column({ name: 'minimo_candidatos_por_lista', type: 'int', nullable: true })
  minimoCandidatosPorLista: number | null;

  @CreateDateColumn({ name: 'fecha_creacion', type: 'timestamptz' })
  fechaCreacion: Date;

  @UpdateDateColumn({ name: 'fecha_actualizacion', type: 'timestamptz' })
  fechaActualizacion: Date;

  @OneToOne(() => ConfiguracionComicio, (config) => config.eleccion)
  configuracionComicio?: ConfiguracionComicio;
}
