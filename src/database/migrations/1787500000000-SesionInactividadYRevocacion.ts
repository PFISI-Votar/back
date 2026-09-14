import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * VOTAR-492 §12.2 (Plan de respuesta a incidentes — Contención): hardening de
 * `refresh_session` para timeout por inactividad y revocación masiva.
 *
 * - `last_activity_at`: marca de la última actividad real de la sesión (no de la
 *   rotación de token). El guard de acceso caduca la sesión cuando supera
 *   `SESSION_IDLE_TIMEOUT`. Se inicializa con `created_at` para las filas vivas.
 * - `revoked_reason`: motivo de la revocación (LOGOUT | INACTIVIDAD | EXPIRACION |
 *   REVOCACION_ADMIN | REVOCACION_GLOBAL | CIERRE_OTRAS_SESIONES). Varchar en vez
 *   de enum nativo para no encadenar un `ALTER TYPE` extra.
 * - `IDX_refresh_session_sub`: la revocación/listado por usuario filtra por `sub`;
 *   hasta ahora solo existía índice por `identificador_sso`.
 * - `IDX_refresh_session_activas`: índice parcial para acelerar la revocación
 *   global y el listado de sesiones activas.
 */
export class SesionInactividadYRevocacion1787500000000 implements MigrationInterface {
  name = 'SesionInactividadYRevocacion1787500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "refresh_session"
        ADD COLUMN "last_activity_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        ADD COLUMN "revoked_reason" character varying(32)
    `);
    await queryRunner.query(
      `UPDATE "refresh_session" SET "last_activity_at" = "created_at"`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_refresh_session_sub" ON "refresh_session" ("sub")`,
    );
    await queryRunner.query(`
      CREATE INDEX "IDX_refresh_session_activas"
      ON "refresh_session" ("revoked_at")
      WHERE "revoked_at" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_refresh_session_activas"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_refresh_session_sub"`);
    await queryRunner.query(`
      ALTER TABLE "refresh_session"
        DROP COLUMN "revoked_reason",
        DROP COLUMN "last_activity_at"
    `);
  }
}
