import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { CampoCandidatoDefinicion } from '../interfaces/campo-candidato-definicion.interface';
import { Eleccion } from './eleccion.entity';

@Entity('configuracion_datos_candidato')
export class ConfiguracionDatosCandidato {
  @PrimaryGeneratedColumn({ name: 'id_configuracion' })
  idConfiguracion: number;

  @Column({ name: 'id_eleccion', type: 'int', unique: true })
  idEleccion: number;

  @OneToOne(() => Eleccion, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'id_eleccion' })
  eleccion: Eleccion;

  @Column({ name: 'campos', type: 'jsonb' })
  campos: CampoCandidatoDefinicion[];

  @CreateDateColumn({ name: 'fecha_creacion', type: 'timestamptz' })
  fechaCreacion: Date;

  @UpdateDateColumn({ name: 'fecha_actualizacion', type: 'timestamptz' })
  fechaActualizacion: Date;
}
