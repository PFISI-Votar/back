import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * VOTAR-377 — "Entidad de Firmas Digitales" (Tercero de Confianza).
 *
 * Crea las dos tablas del esquema commit/reveal de credenciales anónimas y agrega
 * los valores de evento de auditoría. `credencial_validacion` y `emision_credencial`
 * NO comparten columna ni FK entre sí: el backend no puede reconstruir qué
 * credencial anónima pertenece a qué votante (invariante VOTAR-379 / Ley 25.326).
 */
export class EntidadFirmasDigitales1787300000000 implements MigrationInterface {
  name = 'EntidadFirmasDigitales1787300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "public"."credencial_validacion_estado_enum" AS ENUM (
        'EMITIDA', 'CONSUMIDA', 'EXPIRADA'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "credencial_validacion" (
        "id_credencial" uuid NOT NULL DEFAULT gen_random_uuid(),
        "id_eleccion" integer NOT NULL,
        "commit_credencial" character varying(66) NOT NULL,
        "estado" "public"."credencial_validacion_estado_enum" NOT NULL DEFAULT 'EMITIDA',
        "expira_en" TIMESTAMP WITH TIME ZONE NOT NULL,
        "emitida_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_credencial_validacion" PRIMARY KEY ("id_credencial"),
        CONSTRAINT "UQ_credencial_validacion_commit" UNIQUE ("commit_credencial"),
        CONSTRAINT "FK_credencial_validacion_eleccion"
          FOREIGN KEY ("id_eleccion") REFERENCES "eleccion"("id_eleccion")
          ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_credencial_validacion_id_eleccion"
        ON "credencial_validacion" ("id_eleccion")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_credencial_validacion_lookup"
        ON "credencial_validacion" ("id_eleccion", "estado", "expira_en")
    `);

    await queryRunner.query(`
      CREATE TABLE "emision_credencial" (
        "id_emision" uuid NOT NULL DEFAULT gen_random_uuid(),
        "id_eleccion" integer NOT NULL,
        "hash_hoja" character varying(64) NOT NULL,
        "credenciales_emitidas" smallint NOT NULL DEFAULT 0,
        "ultima_emision_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_emision_credencial" PRIMARY KEY ("id_emision"),
        CONSTRAINT "UQ_emision_credencial_eleccion_hoja"
          UNIQUE ("id_eleccion", "hash_hoja"),
        CONSTRAINT "FK_emision_credencial_eleccion"
          FOREIGN KEY ("id_eleccion") REFERENCES "eleccion"("id_eleccion")
          ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_emision_credencial_id_eleccion"
        ON "emision_credencial" ("id_eleccion")
    `);

    await queryRunner.query(
      `ALTER TYPE "public"."audit_log_tipo_evento_enum" ADD VALUE IF NOT EXISTS 'CREDENCIAL_VALIDACION_EMITIDA'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."audit_log_tipo_evento_enum" ADD VALUE IF NOT EXISTS 'FIRMA_VALIDACION_EMITIDA'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_emision_credencial_id_eleccion"`,
    );
    await queryRunner.query(`DROP TABLE "emision_credencial"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_credencial_validacion_lookup"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_credencial_validacion_id_eleccion"`,
    );
    await queryRunner.query(`DROP TABLE "credencial_validacion"`);
    await queryRunner.query(
      `DROP TYPE "public"."credencial_validacion_estado_enum"`,
    );
    // PostgreSQL no permite remover valores de un ENUM de forma portable:
    // CREDENCIAL_VALIDACION_EMITIDA / FIRMA_VALIDACION_EMITIDA quedan en el tipo.
  }
}
