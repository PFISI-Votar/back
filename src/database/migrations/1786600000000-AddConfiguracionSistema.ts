import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * VOTAR-374: parámetros globales de la plataforma (fila singleton).
 * Primer uso: logo institucional embebido en el Acta de Apertura,
 * válido para todos los comicios.
 */
export class AddConfiguracionSistema1786600000000 implements MigrationInterface {
  name = 'AddConfiguracionSistema1786600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "configuracion_sistema" (
        "id" integer NOT NULL,
        "logo_url" character varying,
        "fecha_actualizacion" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_configuracion_sistema" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      INSERT INTO "configuracion_sistema" ("id", "logo_url")
      VALUES (1, NULL)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "configuracion_sistema"`);
  }
}
