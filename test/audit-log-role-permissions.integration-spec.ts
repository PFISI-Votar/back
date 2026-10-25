import '@/common/bootstrap/setup-timezone';
import '@/common/bootstrap/load-env';
import { DataSource } from 'typeorm';
import migratorDataSource from '@/database/data-source';

const appDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 5432),
  username: process.env.DB_APP_USERNAME ?? 'votar_app',
  password: process.env.DB_APP_PASSWORD ?? 'votar_app_dev',
  database: process.env.DB_NAME ?? 'votar',
  entities: ['src/**/*.entity.ts'],
  synchronize: false,
});

const PERMISSION_DENIED_CODE = '42501';

interface PermissionError {
  message?: string;
  code?: string;
  driverError?: { code?: string; message?: string };
}

const isPermissionDenied = (error: unknown): boolean => {
  const err = error as PermissionError;
  const code = err.driverError?.code ?? err.code;
  return code === PERMISSION_DENIED_CODE;
};

const expectPermissionDenied = async (
  operation: () => Promise<unknown>,
): Promise<void> => {
  try {
    await operation();
    throw new Error('Expected operation to be rejected with permission denied');
  } catch (error) {
    if (
      error instanceof Error &&
      error.message ===
        'Expected operation to be rejected with permission denied'
    ) {
      throw error;
    }
    expect(isPermissionDenied(error)).toBe(true);
  }
};

interface AuditLogIdRow {
  id_log: number;
}

const insertAuditLogRowAsMigrator = async (
  descripcion: string,
): Promise<number> => {
  const rows: AuditLogIdRow[] = await migratorDataSource.query(
    `
      INSERT INTO audit_log (
        id_eleccion, tipo_evento, actor, descripcion, hash_registro,
        hash_anterior, ip_origen, endpoint, datos_adicionales
      ) VALUES (
        NULL, 'LOGIN', 'SYSTEM', $1, 'abc123',
        '0000000000000000000000000000000000000000000000000000000000000000',
        'SYSTEM', 'integration-test', NULL
      )
      RETURNING id_log
    `,
    [descripcion],
  );
  return rows[0].id_log;
};

const isPostgresAvailable = async (): Promise<boolean> => {
  try {
    if (!migratorDataSource.isInitialized) {
      await migratorDataSource.initialize();
    }
    await migratorDataSource.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
};

describe('audit_log role permissions (integration) — VOTAR-493', () => {
  let postgresAvailable = false;

  beforeAll(async () => {
    postgresAvailable = await isPostgresAvailable();
    if (!postgresAvailable) {
      return;
    }
    await migratorDataSource.runMigrations();
    await appDataSource.initialize();
  }, 120000);

  afterAll(async () => {
    if (appDataSource.isInitialized) {
      await appDataSource.destroy();
    }
    if (migratorDataSource.isInitialized) {
      await migratorDataSource.destroy();
    }
  });

  const runIfPostgres = (): boolean => {
    if (!postgresAvailable) {
      console.warn(
        'Skipping audit_log role permission tests: PostgreSQL unavailable',
      );
    }
    return postgresAvailable;
  };

  it('votar_app no es superusuario', async () => {
    if (!runIfPostgres()) {
      return;
    }
    const rows: { is_superuser: boolean }[] = await appDataSource.query(
      `SELECT (SELECT rolsuper FROM pg_roles WHERE rolname = current_user) AS is_superuser`,
    );
    expect(rows[0].is_superuser).toBe(false);
  });

  it('votar_app: UPDATE sobre audit_log rechazado por permisos', async () => {
    if (!runIfPostgres()) {
      return;
    }
    const idLog = await insertAuditLogRowAsMigrator('role-test update');
    await expectPermissionDenied(() =>
      appDataSource.query(
        `UPDATE audit_log SET descripcion = 'tampered' WHERE id_log = $1`,
        [idLog],
      ),
    );
  });

  it('votar_app: DELETE sobre audit_log rechazado por permisos', async () => {
    if (!runIfPostgres()) {
      return;
    }
    const idLog = await insertAuditLogRowAsMigrator('role-test delete');
    await expectPermissionDenied(() =>
      appDataSource.query(`DELETE FROM audit_log WHERE id_log = $1`, [idLog]),
    );
  });

  it('votar_app: no puede desactivar el trigger de inmutabilidad', async () => {
    if (!runIfPostgres()) {
      return;
    }
    await expectPermissionDenied(() =>
      appDataSource.query(
        `ALTER TABLE audit_log DISABLE TRIGGER audit_log_prevent_update`,
      ),
    );
  });

  it('votar_app: sí puede insertar en audit_log', async () => {
    if (!runIfPostgres()) {
      return;
    }
    await appDataSource.query('BEGIN');
    try {
      const rows: AuditLogIdRow[] = await appDataSource.query(
        `
          INSERT INTO audit_log (
            id_eleccion, tipo_evento, actor, descripcion, hash_registro,
            hash_anterior, ip_origen, endpoint, datos_adicionales
          ) VALUES (
            NULL, 'LOGIN', 'SYSTEM', 'role-test insert', 'abc123',
            '0000000000000000000000000000000000000000000000000000000000000000',
            'SYSTEM', 'integration-test', NULL
          )
          RETURNING id_log
        `,
      );
      expect(rows).toHaveLength(1);
    } finally {
      await appDataSource.query('ROLLBACK');
    }
  });
});
