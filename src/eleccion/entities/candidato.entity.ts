import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Categoria } from './categoria.entity';
import { Lista } from './lista.entity';

@Entity('candidato')
export class Candidato {
  @PrimaryGeneratedColumn({ name: 'id_candidato' })
  idCandidato: number;

  @Column({ name: 'id_lista', type: 'int' })
  idLista: number;

  @ManyToOne(() => Lista, (lista) => lista.candidatos, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'id_lista' })
  lista: Lista;

  @Column({ name: 'id_categoria', type: 'int' })
  idCategoria: number;

  @ManyToOne(() => Categoria)
  @JoinColumn({ name: 'id_categoria' })
  categoria: Categoria;

  @Column({ name: 'nombre', type: 'varchar' })
  nombre: string;

  @Column({ name: 'apellido', type: 'varchar' })
  apellido: string;

  @Column({ name: 'cargo', type: 'varchar', nullable: true })
  cargo: string | null;

  @Column({ name: 'orden', type: 'int', default: 1 })
  orden: number;

  @Column({ name: 'foto_url', type: 'varchar', nullable: true })
  fotoUrl: string | null;

  @Column({ name: 'datos_adicionales', type: 'jsonb' })
  datosAdicionales: Record<string, unknown>;
}
