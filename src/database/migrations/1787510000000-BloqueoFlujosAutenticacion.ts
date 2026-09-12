import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * VOTAR-492 §12.2 (Contención — "bloqueo de flujos de autenticación SSO
 * institucionales"): interruptor de emergencia persistido en la fila singleton
 * de `configuracion_sistema`.
 *
 * - `auth_bloqueo_alcance`: NINGUNO | ADMIN | TODOS. ADMIN corta login/2fa/refresh
 *   de autoridades; TODOS agrega el login de votantes (flujo SSO institucional).
 *   Nunca afecta a `logout` ni al flujo anónimo de VOTAR-377 FASE 2.
 * - `auth_bloqueo_motivo`: justificación registrada en la bitácora institucional.
 * - `auth_bloqueo_desde`: timestamp de activación (null cuando alcance = NINGUNO).
 * - `auth_bloqueo_por`: ID ofuscado del operador (nunca el identificador SSO en
 *   claro — invariante de privacidad §7.1).
 */
export class BloqueoFlujosAutenticacion1787510000000 implements MigrationInterface {
  name = 'BloqueoFlujosAutenticacion1787510000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "configuracion_sistema"
        ADD COLUMN "auth_bloqueo_alcance" character varying(16) NOT NULL DEFAULT 'NINGUNO',
        ADD COLUMN "auth_bloqueo_motivo" character varying(280),
        ADD COLUMN "auth_bloqueo_desde" TIMESTAMP WITH TIME ZONE,
        ADD COLUMN "auth_bloqueo_por" character varying
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "configuracion_sistema"
        DROP COLUMN "auth_bloqueo_por",
        DROP COLUMN "auth_bloqueo_desde",
        DROP COLUMN "auth_bloqueo_motivo",
        DROP COLUMN "auth_bloqueo_alcance"
    `);
  }
}
