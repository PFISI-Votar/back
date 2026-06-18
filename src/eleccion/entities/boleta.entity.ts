import {
  Column,
  Entity,
  JoinColumn,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { EstadoBoleta } from '../enums/estado-boleta.enum';
import { Eleccion } from './eleccion.entity';
import { Categoria } from './categoria.entity';
import { Lista } from './lista.entity';

@Entity('boleta')
export class Boleta {
  @PrimaryGeneratedColumn({ name: 'id_boleta' })
  idBoleta: number;

  @Column({ name: 'id_eleccion', type: 'int', unique: true })
  idEleccion: number;

  @OneToOne(() => Eleccion)
  @JoinColumn({ name: 'id_eleccion' })
  eleccion: Eleccion;

  @Column({ name: 'titulo', type: 'varchar' })
  titulo: string;

  @Column({ name: 'fecha_publicacion', type: 'timestamptz', nullable: true })
  fechaPublicacion: Date | null;

  @Column({
    name: 'estado',
    type: 'enum',
    enum: EstadoBoleta,
    default: EstadoBoleta.BORRADOR,
  })
  estado: EstadoBoleta;

  @OneToMany(() => Categoria, (categoria) => categoria.boleta)
  categorias: Categoria[];

  @OneToMany(() => Lista, (lista) => lista.boleta)
  listas: Lista[];
}
