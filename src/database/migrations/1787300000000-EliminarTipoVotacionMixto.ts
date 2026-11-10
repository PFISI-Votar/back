import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Elimina el valor 'MIXTO' de tipo_votacion_enum: el wizard de votación
 * (BUD) unificó "por cargo" y "por lista" en un único componente donde
 * "por cargo" ya permite elegir la lista completa como atajo, dejando MIXTO
 * redundante. Postgres no soporta `DROP VALUE` en un enum, así que el tipo
 * se recrea sin ese valor y se remapean las elecciones existentes.
 */
export class EliminarTipoVotacionMixto1787300000000 implements MigrationInterface {
  name = 'EliminarTipoVotacionMixto1787300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // MIXTO ya permitía elegir una lista completa o candidatos individuales
    // por cargo — el mismo comportamiento que ahora tiene POR_CANDIDATO.
    await queryRunner.query(
      `UPDATE "eleccion" SET "tipo_votacion" = 'POR_CANDIDATO' WHERE "tipo_votacion" = 'MIXTO'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."tipo_votacion_enum" RENAME TO "tipo_votacion_enum_old"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."tipo_votacion_enum" AS ENUM('POR_CANDIDATO', 'POR_LISTA')`,
    );
    await queryRunner.query(
      `ALTER TABLE "eleccion" ALTER COLUMN "tipo_votacion" TYPE "public"."tipo_votacion_enum" USING "tipo_votacion"::text::"public"."tipo_votacion_enum"`,
    );
    await queryRunner.query(`DROP TYPE "public"."tipo_votacion_enum_old"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."tipo_votacion_enum" RENAME TO "tipo_votacion_enum_new"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."tipo_votacion_enum" AS ENUM('POR_CANDIDATO', 'POR_LISTA', 'MIXTO')`,
    );
    await queryRunner.query(
      `ALTER TABLE "eleccion" ALTER COLUMN "tipo_votacion" TYPE "public"."tipo_votacion_enum" USING "tipo_votacion"::text::"public"."tipo_votacion_enum"`,
    );
    await queryRunner.query(`DROP TYPE "public"."tipo_votacion_enum_new"`);
  }
}
