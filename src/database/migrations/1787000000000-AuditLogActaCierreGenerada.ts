import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Acta de Cierre: agrega el valor ACTA_CIERRE_GENERADA al enum nativo de
 * Postgres `audit_log_tipo_evento_enum` (el TS enum `TipoEventoAudit` ya lo
 * tenía, pero sin esta migración el INSERT falla con
 * "invalid input value for enum audit_log_tipo_evento_enum").
 */
export class AuditLogActaCierreGenerada1787000000000 implements MigrationInterface {
  name = 'AuditLogActaCierreGenerada1787000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."audit_log_tipo_evento_enum" ADD VALUE IF NOT EXISTS 'ACTA_CIERRE_GENERADA'`,
    );
  }

  public async down(): Promise<void> {
    // PostgreSQL no permite remover valores de un ENUM de forma portable;
    // el down deja el valor ACTA_CIERRE_GENERADA en el tipo.
  }
}
