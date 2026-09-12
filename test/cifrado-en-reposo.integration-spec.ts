import '@/common/bootstrap/setup-timezone';
import '@/common/bootstrap/load-env';
import dataSource from '@/database/data-source';
import { AutoridadElectoral } from '@/auth/entities/autoridad-electoral.entity';
import { RolAutoridad } from '@/auth/enums/rol-autoridad.enum';

/**
 * VOTAR-498 — UAT del cifrado en reposo: confirma que lo que efectivamente
 * queda en el disco de PostgreSQL (leído con SQL crudo, sin pasar por el
 * transformer de TypeORM) nunca contiene el secreto TOTP ni el nombre en
 * texto plano.
 */
const TEST_SECRET = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';
const TEST_NOMBRE = 'Autoridad Prueba VOTAR-498';

interface TotpSecretRow {
  totp_secret: string | null;
  nombre: string;
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

describe('cifrado en reposo — VOTAR-498', () => {
  let postgresAvailable = false;

  beforeAll(async () => {
    process.env.DB_ENCRYPTION_KEY =
      process.env.DB_ENCRYPTION_KEY ?? 'c'.repeat(64);
    postgresAvailable = await isPostgresAvailable();
    if (!postgresAvailable) return;
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
        'Skipping cifrado en reposo integration tests: PostgreSQL unavailable',
      );
    }
    return postgresAvailable;
  };

  it('persiste totp_secret y nombre cifrados, ilegibles con SQL crudo', async () => {
    if (!runIfPostgres()) return;

    await dataSource.query('BEGIN');
    try {
      const repo = dataSource.getRepository(AutoridadElectoral);
      const saved = await repo.save(
        repo.create({
          identificadorSso: `votar-498-test-${Date.now()}`,
          email: `votar-498-test-${Date.now()}@utn.edu.ar`,
          nombre: TEST_NOMBRE,
          rol: RolAutoridad.ELECTION_ADMIN,
          totpSecret: TEST_SECRET,
          totpEnabled: false,
        }),
      );

      // Leído por el repositorio (pasa por el transformer): valores en claro.
      expect(saved.totpSecret).toBe(TEST_SECRET);
      expect(saved.nombre).toBe(TEST_NOMBRE);

      // Leído con SQL crudo (lo que vería un DBA con acceso directo al
      // disco/backup): debe estar cifrado, nunca el secreto en claro.
      const rows: TotpSecretRow[] = await dataSource.query(
        `SELECT totp_secret, nombre FROM autoridad_electoral WHERE id_autoridad = $1`,
        [saved.idAutoridad],
      );
      expect(rows).toHaveLength(1);
      const [row] = rows;

      expect(row.totp_secret).not.toBeNull();
      expect(row.totp_secret).not.toBe(TEST_SECRET);
      expect(row.totp_secret).not.toContain(TEST_SECRET);
      expect(row.totp_secret).toMatch(/^enc:v1:/);

      expect(row.nombre).not.toBe(TEST_NOMBRE);
      expect(row.nombre).not.toContain(TEST_NOMBRE);
      expect(row.nombre).toMatch(/^enc:v1:/);

      // Releído por el repositorio: el transformer descifra correctamente.
      const reloaded = await repo.findOneByOrFail({
        idAutoridad: saved.idAutoridad,
      });
      expect(reloaded.totpSecret).toBe(TEST_SECRET);
      expect(reloaded.nombre).toBe(TEST_NOMBRE);
    } finally {
      await dataSource.query('ROLLBACK');
    }
  });
});
