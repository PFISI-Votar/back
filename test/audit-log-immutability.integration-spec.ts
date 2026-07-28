import '@/common/bootstrap/setup-timezone';
import '@/common/bootstrap/load-env';
import dataSource from '@/database/data-source';

const VOTAR_372_CODE = '23514';
const PG_INTEGRITY_CLASS = '23000';

interface AuditLogMutationError {
  message?: string;
  code?: string;
  driverError?: { code?: string; message?: string };
}

const isAuditLogMutationBlocked = (error: unknown): boolean => {
  const queryError = error as AuditLogMutationError;
  const code = queryError.driverError?.code ?? queryError.code;
  const message = queryError.driverError?.message ?? queryError.message ?? '';
  return (
    code === VOTAR_372_CODE ||
    code === PG_INTEGRITY_CLASS ||
    message.includes('VOTAR-372')
  );
};
interface AuditLogIdRow {
  id_log: number;
}

interface AuditLogDescripcionRow {
  descripcion: string;
}

const isPostgresAvailable = async (): Promise<boolean> => {
  try {
    if (!dataSource.isInitialized) {
      await dataSource.initialize();
    }
    await dataSource.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
};

const expectAuditLogMutationBlocked = async (
  operation: () => Promise<unknown>,
): Promise<void> => {
  try {
    await operation();
    throw new Error('Expected audit_log mutation to be rejected');
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === 'Expected audit_log mutation to be rejected'
    ) {
      throw error;
    }
    expect(isAuditLogMutationBlocked(error)).toBe(true);
  }
};

const insertAuditLogRow = async (descripcion: string): Promise<number> => {
  const rows: AuditLogIdRow[] = await dataSource.query(
    `
      INSERT INTO audit_log (
        id_eleccion,
        tipo_evento,
        actor,
        descripcion,
        hash_registro,
        hash_anterior,
        ip_origen,
        endpoint,
        datos_adicionales
      ) VALUES (
        NULL,
        'LOGIN',
        'SYSTEM',
        $1,
        'abc123',
        '0000000000000000000000000000000000000000000000000000000000000000',
        'SYSTEM',
        'integration-test',
        NULL
      )
      RETURNING id_log
    `,
    [descripcion],
  );
  return rows[0].id_log;
};

describe('audit_log immutability (integration) — VOTAR-372', () => {
  let postgresAvailable = false;

  beforeAll(async () => {
    postgresAvailable = await isPostgresAvailable();
    if (!postgresAvailable) {
      return;
    }
    await dataSource.runMigrations();
  }, 120000);

  afterAll(async () => {
    if (dataSource.isInitialized) {
      await dataSource.destroy();
    }
  });

  const runIfPostgres = (): boolean => {
    if (!postgresAvailable) {
      console.warn(
        'Skipping audit_log immutability integration tests: PostgreSQL unavailable',
      );
    }
    return postgresAvailable;
  };

  it('UAT-01: blocks UPDATE on a persisted row', async () => {
    if (!runIfPostgres()) {
      return;
    }
    await dataSource.query('BEGIN');
    try {
      const idLog = await insertAuditLogRow('registro original UAT-01');
      await dataSource.query('SAVEPOINT before_update');
      await expectAuditLogMutationBlocked(() =>
        dataSource.query(
          `UPDATE audit_log SET descripcion = 'tampered' WHERE id_log = $1`,
          [idLog],
        ),
      );
      await dataSource.query('ROLLBACK TO SAVEPOINT before_update');
      const rows: AuditLogDescripcionRow[] = await dataSource.query(
        `SELECT descripcion FROM audit_log WHERE id_log = $1`,
        [idLog],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].descripcion).toBe('registro original UAT-01');
    } finally {
      await dataSource.query('ROLLBACK');
    }
  });

  it('UAT-01: blocks DELETE on a persisted row', async () => {
    if (!runIfPostgres()) {
      return;
    }
    await dataSource.query('BEGIN');
    try {
      const idLog = await insertAuditLogRow('registro original UAT-01 delete');
      await dataSource.query('SAVEPOINT before_delete');
      await expectAuditLogMutationBlocked(() =>
        dataSource.query(`DELETE FROM audit_log WHERE id_log = $1`, [idLog]),
      );
      await dataSource.query('ROLLBACK TO SAVEPOINT before_delete');
      const rows: AuditLogIdRow[] = await dataSource.query(
        `SELECT id_log FROM audit_log WHERE id_log = $1`,
        [idLog],
      );
      expect(rows).toHaveLength(1);
    } finally {
      await dataSource.query('ROLLBACK');
    }
  });

  it('UAT-02: blocks mass DELETE on audit_log', async () => {
    if (!runIfPostgres()) {
      return;
    }
    await dataSource.query('BEGIN');
    try {
      const idLog1 = await insertAuditLogRow('fila masiva 1');
      const idLog2 = await insertAuditLogRow('fila masiva 2');
      await dataSource.query('SAVEPOINT before_mass_delete');
      await expectAuditLogMutationBlocked(() =>
        dataSource.query(`DELETE FROM audit_log`),
      );
      await dataSource.query('ROLLBACK TO SAVEPOINT before_mass_delete');
      const rows: AuditLogIdRow[] = await dataSource.query(
        `SELECT id_log FROM audit_log WHERE id_log IN ($1, $2)`,
        [idLog1, idLog2],
      );
      expect(rows).toHaveLength(2);
    } finally {
      await dataSource.query('ROLLBACK');
    }
  });

  it('UAT-02: blocks TRUNCATE on audit_log', async () => {
    if (!runIfPostgres()) {
      return;
    }
    await dataSource.query('BEGIN');
    try {
      const idLog1 = await insertAuditLogRow('truncate test 1');
      const idLog2 = await insertAuditLogRow('truncate test 2');
      await dataSource.query('SAVEPOINT before_truncate');
      await expectAuditLogMutationBlocked(() =>
        dataSource.query(`TRUNCATE audit_log`),
      );
      await dataSource.query('ROLLBACK TO SAVEPOINT before_truncate');
      const rows: AuditLogIdRow[] = await dataSource.query(
        `SELECT id_log FROM audit_log WHERE id_log IN ($1, $2)`,
        [idLog1, idLog2],
      );
      expect(rows).toHaveLength(2);
    } finally {
      await dataSource.query('ROLLBACK');
    }
  });

  it('allows INSERT on audit_log', async () => {
    if (!runIfPostgres()) {
      return;
    }
    await dataSource.query('BEGIN');
    try {
      const idLog = await insertAuditLogRow('insert permitido');
      const rows: AuditLogIdRow[] = await dataSource.query(
        `SELECT id_log FROM audit_log WHERE id_log = $1`,
        [idLog],
      );
      expect(rows).toHaveLength(1);
    } finally {
      await dataSource.query('ROLLBACK');
    }
  });
});
