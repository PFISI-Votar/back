import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * VOTAR-492 §12.2: agrega los valores SESION_REVOCADA y BLOQUEO_AUTENTICACION al
 * enum nativo de Postgres `audit_log_tipo_evento_enum` (el TS enum
 * `TipoEventoAudit` ya los tiene, pero sin esta migración el INSERT falla con
 * "invalid input value for enum audit_log_tipo_evento_enum").
 */
export class AuditLogContencionSesiones1787520000000 implements MigrationInterface {
  name = 'AuditLogContencionSesiones1787520000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."audit_log_tipo_evento_enum" ADD VALUE IF NOT EXISTS 'SESION_REVOCADA'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."audit_log_tipo_evento_enum" ADD VALUE IF NOT EXISTS 'BLOQUEO_AUTENTICACION'`,
    );
  }

  public async down(): Promise<void> {
    // PostgreSQL no permite remover valores de un ENUM de forma portable;
    // el down deja los valores en el tipo.
  }
}
