import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Índices para consultas avanzadas sobre audit_log (VOTAR-371).
 */
export class AuditLogSearchIndexes1782900000000 implements MigrationInterface {
  name = 'AuditLogSearchIndexes1782900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_audit_log_timestamp"
      ON "audit_log" ("timestamp" DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_audit_log_tipo_evento"
      ON "audit_log" ("tipo_evento")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_audit_log_id_eleccion"
      ON "audit_log" ("id_eleccion")
      WHERE "id_eleccion" IS NOT NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_audit_log_actor"
      ON "audit_log" ("actor")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_audit_log_actor"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_audit_log_id_eleccion"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_audit_log_tipo_evento"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_audit_log_timestamp"`);
  }
}
