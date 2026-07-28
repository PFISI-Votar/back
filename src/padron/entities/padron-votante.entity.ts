import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
  Unique,
} from 'typeorm';
import { PadronElectoral } from './padron-electoral.entity';

/**
 * Hoja del Merkle Tree del padrón. Almacena EXCLUSIVAMENTE el hash Keccak-256
 * de la identidad del votante (`hash_hoja`, 64 hex / 256 bits). NUNCA datos
 * personales en texto plano (Ley 25.326 — desvinculación estructural, US-330).
 */
@Entity('padron_votante')
@Unique(['padron', 'hashHoja'])
export class PadronVotante {
  @PrimaryGeneratedColumn('uuid', { name: 'id_padron_votante' })
  idPadronVotante: string;

  @ManyToOne(() => PadronElectoral, (padron) => padron.votantes, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'id_padron' })
  padron: PadronElectoral;

  @Column({ name: 'indice_hoja', type: 'int' })
  indiceHoja: number;

  @Index()
  @Column({ name: 'hash_hoja', type: 'varchar', length: 64 })
  hashHoja: string;

  @CreateDateColumn({ name: 'generado_en', type: 'timestamptz' })
  generadoEn: Date;
}
