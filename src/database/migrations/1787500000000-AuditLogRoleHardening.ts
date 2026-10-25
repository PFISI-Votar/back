import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * VOTAR-493: rol de aplicación restringido para runtime, separado del rol
 * superusuario (`postgres`) usado hoy por la app y por las migraciones.
 *
 * Un superusuario puede desactivar los triggers de inmutabilidad de
 * audit_log (`DISABLE TRIGGER`, `session_replication_role = replica`),
 * evadiendo la protección de VOTAR-372. Este rol nuevo (`votar_app`) no
 * tiene privilegios de superusuario ni es propietario de la tabla, y no
 * puede hacer UPDATE/DELETE/TRUNCATE sobre audit_log a nivel de permisos —
 * independientemente de que el trigger también lo bloquee.
 *
 * Los triggers se marcan ENABLE ALWAYS para que
 * `session_replication_role = replica` tampoco los saltee.
 *
 * Las migraciones siguen corriendo con el rol superusuario (DB_USERNAME),
 * ya que crear roles/triggers requiere privilegios que `votar_app` no
 * tiene. El runtime de NestJS pasa a conectarse como `votar_app`
 * (ver database.config.ts y DB_APP_USERNAME/DB_APP_PASSWORD).
 */
export class AuditLogRoleHardening1787500000000 implements MigrationInterface {
  name = 'AuditLogRoleHardening1787500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const appPassword = process.env.DB_APP_PASSWORD ?? 'votar_app_dev';
    const dbName = process.env.DB_NAME ?? 'votar';

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'votar_app') THEN
          CREATE ROLE votar_app WITH LOGIN PASSWORD '${appPassword}';
        END IF;
      END
      $$;
    `);

    await queryRunner.query(`GRANT CONNECT ON DATABASE ${dbName} TO votar_app`);
    await queryRunner.query(`GRANT USAGE ON SCHEMA public TO votar_app`);
    await queryRunner.query(
      `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO votar_app`,
    );
    await queryRunner.query(
      `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO votar_app`,
    );
    await queryRunner.query(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO votar_app`,
    );
    await queryRunner.query(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO votar_app`,
    );

    // audit_log es append-only: revocar explícitamente UPDATE/DELETE/TRUNCATE,
    // sin depender solo del trigger.
    await queryRunner.query(
      `REVOKE UPDATE, DELETE, TRUNCATE ON audit_log FROM votar_app`,
    );
    await queryRunner.query(`GRANT SELECT, INSERT ON audit_log TO votar_app`);

    await queryRunner.query(
      `ALTER TABLE audit_log ENABLE ALWAYS TRIGGER audit_log_prevent_update`,
    );
    await queryRunner.query(
      `ALTER TABLE audit_log ENABLE ALWAYS TRIGGER audit_log_prevent_delete`,
    );
    await queryRunner.query(
      `ALTER TABLE audit_log ENABLE ALWAYS TRIGGER audit_log_prevent_truncate`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE audit_log ENABLE TRIGGER audit_log_prevent_truncate`,
    );
    await queryRunner.query(
      `ALTER TABLE audit_log ENABLE TRIGGER audit_log_prevent_delete`,
    );
    await queryRunner.query(
      `ALTER TABLE audit_log ENABLE TRIGGER audit_log_prevent_update`,
    );

    await queryRunner.query(
      `REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM votar_app`,
    );
    await queryRunner.query(
      `REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM votar_app`,
    );
    await queryRunner.query(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLES FROM votar_app`,
    );
    await queryRunner.query(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE USAGE, SELECT ON SEQUENCES FROM votar_app`,
    );
    await queryRunner.query(`DROP ROLE IF EXISTS votar_app`);
  }
}
