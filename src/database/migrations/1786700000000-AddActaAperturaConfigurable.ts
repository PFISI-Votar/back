import { MigrationInterface, QueryRunner } from 'typeorm';

const PLANTILLA_DEFAULT = {
  incluirDescripcion: true,
  incluirDatosApertura: true,
  incluirResumenPadron: true,
  incluirOfertaElectoral: true,
  incluirVerificacionCriptografica: true,
  incluirLogo: true,
};

/**
 * VOTAR-374: Acta de Apertura configurable.
 * - `eleccion`: snapshot de la apertura real (modo, fecha, responsable) para
 *   mostrar "quién y cuándo" en el Acta, sin depender del audit_log
 *   ofuscado (que sigue igual, es un canal de auditoría distinto).
 * - `configuracion_sistema`: plantilla con los toggles de contenido del
 *   Acta, editable desde /configuracion.
 */
export class AddActaAperturaConfigurable1786700000000 implements MigrationInterface {
  name = 'AddActaAperturaConfigurable1786700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "eleccion"
      ADD COLUMN "apertura_real_en" TIMESTAMP WITH TIME ZONE,
      ADD COLUMN "apertura_modo" character varying,
      ADD COLUMN "apertura_actor_nombre" character varying,
      ADD COLUMN "apertura_actor_rol" character varying
    `);

    await queryRunner.query(`
      ALTER TABLE "configuracion_sistema"
      ADD COLUMN "acta_apertura_plantilla" jsonb NOT NULL DEFAULT '${JSON.stringify(PLANTILLA_DEFAULT)}'::jsonb
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "configuracion_sistema"
      DROP COLUMN "acta_apertura_plantilla"
    `);

    await queryRunner.query(`
      ALTER TABLE "eleccion"
      DROP COLUMN "apertura_actor_rol",
      DROP COLUMN "apertura_actor_nombre",
      DROP COLUMN "apertura_modo",
      DROP COLUMN "apertura_real_en"
    `);
  }
}
