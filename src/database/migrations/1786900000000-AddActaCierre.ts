import { MigrationInterface, QueryRunner } from 'typeorm';

const PLANTILLA_DEFAULT = {
  incluirDescripcion: true,
  incluirParticipacion: true,
  incluirResultadosPorLista: true,
  incluirVerificacionCriptografica: true,
  incluirLogo: true,
};

/**
 * Acta de Cierre: mismo mecanismo de plantilla (Simple/Personalizado) ya
 * usado para el Acta de Apertura, aplicado al escrutinio final.
 */
export class AddActaCierre1786900000000 implements MigrationInterface {
  name = 'AddActaCierre1786900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "configuracion_sistema"
      ADD COLUMN "acta_cierre_plantilla" jsonb NOT NULL DEFAULT '${JSON.stringify(PLANTILLA_DEFAULT)}'::jsonb,
      ADD COLUMN "acta_cierre_modo" character varying NOT NULL DEFAULT 'SIMPLE',
      ADD COLUMN "acta_cierre_plantilla_texto" text
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "configuracion_sistema"
      DROP COLUMN "acta_cierre_plantilla_texto",
      DROP COLUMN "acta_cierre_modo",
      DROP COLUMN "acta_cierre_plantilla"
    `);
  }
}
