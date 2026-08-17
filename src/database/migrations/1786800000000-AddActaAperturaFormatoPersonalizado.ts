import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * VOTAR-374: modo Personalizado del Acta de Apertura. El admin puede
 * escribir un texto libre con variables `{{token}}` que se interpolan con
 * los datos del comicio; convive con el modo Simple (toggles) ya existente.
 */
export class AddActaAperturaFormatoPersonalizado1786800000000
  implements MigrationInterface
{
  name = 'AddActaAperturaFormatoPersonalizado1786800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "configuracion_sistema"
      ADD COLUMN "acta_apertura_modo" character varying NOT NULL DEFAULT 'SIMPLE',
      ADD COLUMN "acta_apertura_plantilla_texto" text
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "configuracion_sistema"
      DROP COLUMN "acta_apertura_plantilla_texto",
      DROP COLUMN "acta_apertura_modo"
    `);
  }
}
