import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * VOTAR-372: inmutabilidad física de audit_log en PostgreSQL.
 * Bloquea UPDATE, DELETE y TRUNCATE una vez persistido un registro.
 */
export class AuditLogImmutability1782900000000 implements MigrationInterface {
  name = 'AuditLogImmutability1782900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION prevent_audit_log_mutation()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $$
      BEGIN
        RAISE EXCEPTION 'VOTAR-372: audit_log es append-only; operación % prohibida', TG_OP
          USING ERRCODE = 'integrity_constraint_violation';
      END;
      $$;
    `);
    await queryRunner.query(`
      CREATE TRIGGER audit_log_prevent_update
        BEFORE UPDATE ON audit_log
        FOR EACH ROW
        EXECUTE FUNCTION prevent_audit_log_mutation();
    `);
    await queryRunner.query(`
      CREATE TRIGGER audit_log_prevent_delete
        BEFORE DELETE ON audit_log
        FOR EACH ROW
        EXECUTE FUNCTION prevent_audit_log_mutation();
    `);
    await queryRunner.query(`
      CREATE TRIGGER audit_log_prevent_truncate
        BEFORE TRUNCATE ON audit_log
        FOR EACH STATEMENT
        EXECUTE FUNCTION prevent_audit_log_mutation();
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TRIGGER IF EXISTS audit_log_prevent_truncate ON audit_log`,
    );
    await queryRunner.query(
      `DROP TRIGGER IF EXISTS audit_log_prevent_delete ON audit_log`,
    );
    await queryRunner.query(
      `DROP TRIGGER IF EXISTS audit_log_prevent_update ON audit_log`,
    );
    await queryRunner.query(
      `DROP FUNCTION IF EXISTS prevent_audit_log_mutation()`,
    );
  }
}
