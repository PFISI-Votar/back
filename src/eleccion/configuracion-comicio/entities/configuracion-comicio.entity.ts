import {
  Column,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { MetodoAutenticacion } from '@/eleccion/configuracion-comicio/enums/metodo-autenticacion.enum';
import { PoliticaRevoto } from '@/eleccion/configuracion-comicio/enums/politica-revoto.enum';
import { Eleccion } from '@/eleccion/entities/eleccion.entity';

@Entity('configuracion_comicio')
export class ConfiguracionComicio {
  @PrimaryGeneratedColumn({ name: 'id_configuracion' })
  idConfiguracion: number;

  @Column({ name: 'id_eleccion', type: 'int', unique: true })
  idEleccion: number;

  @OneToOne(() => Eleccion, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'id_eleccion' })
  eleccion: Eleccion;

  @Column({ name: 'permitir_voto_en_blanco', type: 'boolean', default: false })
  permitirVotoEnBlanco: boolean;

  @Column({ name: 'permitir_voto_multiple', type: 'boolean', default: false })
  permitirVotoMultiple: boolean;

  @Column({ name: 'permitir_voto_nulo', type: 'boolean', default: true })
  permitirVotoNulo: boolean;

  @Column({ name: 'max_votos_por_votante', type: 'int', default: 1 })
  maxVotosPorVotante: number;

  @Column({ name: 'min_intervalo_segundos', type: 'int', default: 0 })
  minIntervaloSegundos: number;

  @Column({
    name: 'mostrar_resultados_tiempo_real',
    type: 'boolean',
    default: false,
  })
  mostrarResultadosTiempoReal: boolean;

  @Column({ name: 'duracion_minutos', type: 'int', nullable: true })
  duracionMinutos: number | null;

  @Column({
    name: 'metodos_autenticacion',
    type: 'enum',
    enum: MetodoAutenticacion,
    array: true,
  })
  metodosAutenticacion: MetodoAutenticacion[];

  @Column({
    name: 'politica_revoto',
    type: 'enum',
    enum: PoliticaRevoto,
    default: PoliticaRevoto.DISABLED,
  })
  politicaRevoto: PoliticaRevoto;

  @Column({
    name: 'mostrar_dashboard_resultados',
    type: 'boolean',
    default: true,
  })
  mostrarDashboardResultados: boolean;

  @Column({
    name: 'mostrar_dashboard_participacion',
    type: 'boolean',
    default: true,
  })
  mostrarDashboardParticipacion: boolean;

  @Column({
    name: 'mostrar_dashboard_revoto',
    type: 'boolean',
    default: true,
  })
  mostrarDashboardRevoto: boolean;

  @Column({
    name: 'mostrar_dashboard_transacciones',
    type: 'boolean',
    default: true,
  })
  mostrarDashboardTransacciones: boolean;
}
