import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { CampoDatosCandidato } from '@/eleccion/candidato/entities/campo-datos-candidato.entity';
import { Eleccion } from '@/eleccion/entities/eleccion.entity';

@Entity('configuracion_datos_candidato')
export class ConfiguracionDatosCandidato {
  @PrimaryGeneratedColumn({ name: 'id_configuracion' })
  idConfiguracion: number;

  @Column({ name: 'id_eleccion', type: 'int', unique: true })
  idEleccion: number;

  @OneToOne(() => Eleccion, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'id_eleccion' })
  eleccion: Eleccion;

  @OneToMany(() => CampoDatosCandidato, (campo) => campo.configuracion)
  campos: CampoDatosCandidato[];

  @CreateDateColumn({ name: 'fecha_creacion', type: 'timestamptz' })
  fechaCreacion: Date;

  @UpdateDateColumn({ name: 'fecha_actualizacion', type: 'timestamptz' })
  fechaActualizacion: Date;
}
