import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Toggles de contenido del Acta de Apertura (VOTAR-374). Gobiernan qué
 * secciones arma el frontend al renderizar el PDF; el backend siempre
 * calcula todos los datos (export de bajo tráfico, no vale condicionar
 * queries por toggle).
 */
export type ActaAperturaPlantilla = {
  incluirDescripcion: boolean;
  incluirDatosApertura: boolean;
  incluirResumenPadron: boolean;
  incluirOfertaElectoral: boolean;
  incluirVerificacionCriptografica: boolean;
  incluirLogo: boolean;
};

export const ACTA_APERTURA_PLANTILLA_DEFAULT: ActaAperturaPlantilla = {
  incluirDescripcion: true,
  incluirDatosApertura: true,
  incluirResumenPadron: true,
  incluirOfertaElectoral: true,
  incluirVerificacionCriptografica: true,
  incluirLogo: true,
};

/**
 * SIMPLE: se arma con los toggles de `ActaAperturaPlantilla` (secciones
 * fijas). PERSONALIZADO: el cuerpo del Acta se arma interpolando
 * `actaAperturaPlantillaTexto` con los datos del comicio; el header/footer
 * institucional se mantienen fijos en ambos modos (ver front,
 * `generar-acta-apertura-pdf.ts`).
 */
export type ActaAperturaModo = 'SIMPLE' | 'PERSONALIZADO';

export const ACTA_APERTURA_MODO_DEFAULT: ActaAperturaModo = 'SIMPLE';

/**
 * Toggles de contenido del Acta de Cierre (escrutinio final). Mismo rol
 * que `ActaAperturaPlantilla`: gobiernan qué secciones arma el frontend en
 * modo SIMPLE.
 */
export type ActaCierrePlantilla = {
  incluirDescripcion: boolean;
  incluirParticipacion: boolean;
  incluirResultadosPorLista: boolean;
  incluirVerificacionCriptografica: boolean;
  incluirLogo: boolean;
};

export const ACTA_CIERRE_PLANTILLA_DEFAULT: ActaCierrePlantilla = {
  incluirDescripcion: true,
  incluirParticipacion: true,
  incluirResultadosPorLista: true,
  incluirVerificacionCriptografica: true,
  incluirLogo: true,
};

/**
 * Fila singleton (id fijo = 1) con parámetros globales de la plataforma,
 * válidos para todos los comicios (ej. logo institucional y plantilla del
 * Acta de Apertura, VOTAR-374).
 */
@Entity('configuracion_sistema')
export class ConfiguracionSistema {
  @ApiProperty({ example: 1 })
  @PrimaryColumn({ name: 'id', type: 'int' })
  id!: number;

  @ApiProperty({
    example: '/imagenes/3f8c1c2a-5b1e-4a9d-9f0c-2b7e5d6a1c34',
    nullable: true,
  })
  @Column({ name: 'logo_url', type: 'varchar', nullable: true })
  logoUrl!: string | null;

  @ApiProperty()
  @Column({ name: 'acta_apertura_plantilla', type: 'jsonb' })
  actaAperturaPlantilla!: ActaAperturaPlantilla;

  @ApiProperty({ example: 'SIMPLE' })
  @Column({ name: 'acta_apertura_modo', type: 'varchar' })
  actaAperturaModo!: ActaAperturaModo;

  @ApiProperty({ nullable: true })
  @Column({
    name: 'acta_apertura_plantilla_texto',
    type: 'text',
    nullable: true,
  })
  actaAperturaPlantillaTexto!: string | null;

  @ApiProperty()
  @Column({ name: 'acta_cierre_plantilla', type: 'jsonb' })
  actaCierrePlantilla!: ActaCierrePlantilla;

  @ApiProperty({ example: 'SIMPLE' })
  @Column({ name: 'acta_cierre_modo', type: 'varchar' })
  actaCierreModo!: ActaAperturaModo;

  @ApiProperty({ nullable: true })
  @Column({
    name: 'acta_cierre_plantilla_texto',
    type: 'text',
    nullable: true,
  })
  actaCierrePlantillaTexto!: string | null;

  @ApiProperty()
  @UpdateDateColumn({ name: 'fecha_actualizacion', type: 'timestamptz' })
  fechaActualizacion!: Date;
}
