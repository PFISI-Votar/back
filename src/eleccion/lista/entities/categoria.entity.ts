import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Boleta } from '@/eleccion/lista/entities/boleta.entity';

@Entity('categoria')
export class Categoria {
  @PrimaryGeneratedColumn({ name: 'id_categoria' })
  idCategoria: number;

  @Column({ name: 'id_boleta', type: 'int' })
  idBoleta: number;

  @ManyToOne(() => Boleta, (boleta) => boleta.categorias)
  @JoinColumn({ name: 'id_boleta' })
  boleta: Boleta;

  @Column({ name: 'nombre', type: 'varchar' })
  nombre: string;

  @Column({ name: 'descripcion', type: 'varchar', nullable: true })
  descripcion: string | null;

  @Column({ name: 'cantidad_cargos', type: 'int', default: 1 })
  cantidadCargos: number;

  @Column({ name: 'orden', type: 'int', default: 1 })
  orden: number;
}
