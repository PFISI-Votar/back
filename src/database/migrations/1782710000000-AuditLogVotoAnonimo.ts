import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * VOTAR-379: ip_origen nullable + tipo VOTO_EMITIDO anónimo (sin IP/UA/session).
 */
export class AuditLogVotoAnonimo1782710000000 implements MigrationInterface {
  name = 'AuditLogVotoAnonimo1782710000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."audit_log_tipo_evento_enum" ADD VALUE IF NOT EXISTS 'VOTO_EMITIDO'`,
    );
    await queryRunner.query(
      `ALTER TABLE "audit_log" ALTER COLUMN "ip_origen" DROP NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "audit_log" SET "ip_origen" = '0.0.0.0' WHERE "ip_origen" IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "audit_log" ALTER COLUMN "ip_origen" SET NOT NULL`,
    );
    // PostgreSQL no permite remover valores de un ENUM de forma portable;
    // el down deja el valor VOTO_EMITIDO en el tipo.
  }
}
