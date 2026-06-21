import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { EstadoLista } from '@/eleccion/lista/enums/estado-lista.enum';
import { Boleta } from '@/eleccion/lista/entities/boleta.entity';
import { Candidato } from '@/eleccion/candidato/entities/candidato.entity';

@Entity('lista')
export class Lista {
  @PrimaryGeneratedColumn({ name: 'id_lista' })
  idLista: number;

  @Column({ name: 'id_boleta', type: 'int' })
  idBoleta: number;

  @ManyToOne(() => Boleta, (boleta) => boleta.listas)
  @JoinColumn({ name: 'id_boleta' })
  boleta: Boleta;

  @Column({ name: 'nombre', type: 'varchar' })
  nombre: string;

  @Column({ name: 'sigla', type: 'varchar' })
  sigla: string;

  @Column({ name: 'color', type: 'varchar', nullable: true })
  color: string | null;

  @Column({ name: 'fecha_oficializacion', type: 'timestamptz', nullable: true })
  fechaOficializacion: Date | null;

  @Column({
    name: 'estado',
    type: 'enum',
    enum: EstadoLista,
    default: EstadoLista.BORRADOR,
  })
  estado: EstadoLista;

  @Column({ name: 'list_id', type: 'int', nullable: true })
  listId: number | null;

  @OneToMany(() => Candidato, (candidato) => candidato.lista)
  candidatos: Candidato[];
}
