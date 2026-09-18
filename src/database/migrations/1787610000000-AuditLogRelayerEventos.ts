import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * VOTAR-497 — eventos de auditoría del relayer de gas.
 */
export class AuditLogRelayerEventos1787610000000 implements MigrationInterface {
  name = 'AuditLogRelayerEventos1787610000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."audit_log_tipo_evento_enum" ADD VALUE IF NOT EXISTS 'RELAYER_CAPACIDAD_EMITIDA'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."audit_log_tipo_evento_enum" ADD VALUE IF NOT EXISTS 'RELAYER_CAST_ENVIADO'`,
    );
  }

  public async down(): Promise<void> {
    // PostgreSQL no permite remover valores de un ENUM de forma portable.
  }
}
