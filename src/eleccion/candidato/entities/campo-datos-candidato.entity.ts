import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { TipoCampoCandidatoEnum } from '@/eleccion/candidato/enums/tipo-campo-candidato.enum';
import { ConfiguracionDatosCandidato } from '@/eleccion/candidato/entities/configuracion-datos-candidato.entity';

@Entity('campo_datos_candidato')
export class CampoDatosCandidato {
  @PrimaryGeneratedColumn({ name: 'id_campo' })
  idCampo: number;

  @Column({ name: 'id_configuracion', type: 'int' })
  idConfiguracion: number;

  @ManyToOne(() => ConfiguracionDatosCandidato, (config) => config.campos, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'id_configuracion' })
  configuracion: ConfiguracionDatosCandidato;

  @Column({ name: 'clave', type: 'varchar', length: 50 })
  clave: string;

  @Column({ name: 'etiqueta', type: 'varchar', length: 100 })
  etiqueta: string;

  @Column({
    name: 'tipo',
    type: 'enum',
    enum: TipoCampoCandidatoEnum,
  })
  tipo: TipoCampoCandidatoEnum;

  @Column({ name: 'obligatorio', type: 'boolean', default: true })
  obligatorio: boolean;

  @Column({ name: 'ejemplo', type: 'varchar', length: 255, nullable: true })
  ejemplo: string | null;

  @Column({ name: 'ayuda', type: 'varchar', length: 500, nullable: true })
  ayuda: string | null;

  @Column({ name: 'orden', type: 'int' })
  orden: number;

  @Column({ name: 'min_length', type: 'int', nullable: true })
  minLength: number | null;

  @Column({ name: 'max_length', type: 'int', nullable: true })
  maxLength: number | null;

  @Column({ name: 'min_valor', type: 'double precision', nullable: true })
  minValor: number | null;

  @Column({ name: 'max_valor', type: 'double precision', nullable: true })
  maxValor: number | null;

  @Column({ name: 'pattern', type: 'varchar', length: 500, nullable: true })
  pattern: string | null;

  @Column({
    name: 'pattern_message',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  patternMessage: string | null;
}
