import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildLibpqSslEnv,
  isDatabaseProductionEnv,
  resolveDatabaseSsl,
} from '@/config/database-ssl.config';

const FAKE_CA_PEM =
  '-----BEGIN CERTIFICATE-----\nfake-ca\n-----END CERTIFICATE-----';

const makeGetter =
  (env: Record<string, string | undefined>) =>
  (key: string): string | undefined =>
    env[key];

describe('database-ssl.config', () => {
  describe('isDatabaseProductionEnv', () => {
    it('is production when DEVELOPMENT is falsy/unset (string getter)', () => {
      expect(isDatabaseProductionEnv(() => undefined)).toBe(true);
      expect(isDatabaseProductionEnv(() => 'false')).toBe(true);
    });

    it('is not production when DEVELOPMENT is "true" (string)', () => {
      expect(isDatabaseProductionEnv(() => 'true')).toBe(false);
    });

    it('is not production when DEVELOPMENT is the boolean true (Joi-coerced ConfigService)', () => {
      expect(isDatabaseProductionEnv(() => true)).toBe(false);
    });

    it('is production when DEVELOPMENT is the boolean false', () => {
      expect(isDatabaseProductionEnv(() => false)).toBe(true);
    });
  });

  describe('resolveDatabaseSsl', () => {
    it('returns false when DB_SSL_MODE is disable and not in production', () => {
      const get = makeGetter({ DB_SSL_MODE: 'disable' });
      expect(resolveDatabaseSsl(get, false)).toBe(false);
    });

    it('returns false when DB_SSL_MODE is unset (defaults to disable)', () => {
      const get = makeGetter({});
      expect(resolveDatabaseSsl(get, false)).toBe(false);
    });

    it('throws when DB_SSL_MODE is disable in production (fail-closed)', () => {
      const get = makeGetter({ DB_SSL_MODE: 'disable' });
      expect(() => resolveDatabaseSsl(get, true)).toThrow(/VOTAR-498/);
    });

    it('rejects an unknown DB_SSL_MODE value', () => {
      const get = makeGetter({ DB_SSL_MODE: 'bogus' });
      expect(() => resolveDatabaseSsl(get, false)).toThrow(/DB_SSL_MODE/);
    });

    it('"require" encrypts without validating the certificate chain', () => {
      const get = makeGetter({ DB_SSL_MODE: 'require' });
      const ssl = resolveDatabaseSsl(get, false);
      expect(ssl).toMatchObject({ rejectUnauthorized: false });
    });

    it('"verify-ca" accepts an inline PEM and validates without checking hostname', () => {
      const get = makeGetter({
        DB_SSL_MODE: 'verify-ca',
        DB_SSL_CA: FAKE_CA_PEM,
      });
      const ssl = resolveDatabaseSsl(get, false);
      expect(ssl).toMatchObject({ ca: FAKE_CA_PEM, rejectUnauthorized: true });
      expect(
        typeof (ssl as { checkServerIdentity?: unknown }).checkServerIdentity,
      ).toBe('function');
    });

    it('"verify-ca" reads DB_SSL_CA from a file path', () => {
      const dir = mkdtempSync(join(tmpdir(), 'votar-ssl-'));
      const caPath = join(dir, 'ca.crt');
      writeFileSync(caPath, FAKE_CA_PEM);
      const get = makeGetter({ DB_SSL_MODE: 'verify-ca', DB_SSL_CA: caPath });
      const ssl = resolveDatabaseSsl(get, false);
      expect(ssl).toMatchObject({ ca: FAKE_CA_PEM });
    });

    it('throws when "verify-ca" is missing DB_SSL_CA', () => {
      const get = makeGetter({ DB_SSL_MODE: 'verify-ca' });
      expect(() => resolveDatabaseSsl(get, false)).toThrow(/DB_SSL_CA/);
    });

    it('throws when "verify-full" is missing DB_SSL_CA', () => {
      const get = makeGetter({ DB_SSL_MODE: 'verify-full' });
      expect(() => resolveDatabaseSsl(get, true)).toThrow(/DB_SSL_CA/);
    });

    it('"verify-full" sets servername for hostname validation', () => {
      const get = makeGetter({
        DB_SSL_MODE: 'verify-full',
        DB_SSL_CA: FAKE_CA_PEM,
        DB_SSL_SERVERNAME: 'db.votar.internal',
      });
      const ssl = resolveDatabaseSsl(get, true);
      expect(ssl).toMatchObject({
        rejectUnauthorized: true,
        servername: 'db.votar.internal',
      });
    });

    it('throws when a certificate path does not exist on disk', () => {
      const get = makeGetter({
        DB_SSL_MODE: 'verify-ca',
        DB_SSL_CA: '/nonexistent/path/ca.crt',
      });
      expect(() => resolveDatabaseSsl(get, false)).toThrow(/VOTAR-498/);
    });
  });

  describe('buildLibpqSslEnv', () => {
    it('sets PGSSLMODE=disable when disabled', () => {
      const get = makeGetter({ DB_SSL_MODE: 'disable' });
      expect(buildLibpqSslEnv(get)).toEqual({ PGSSLMODE: 'disable' });
    });

    it('maps file-path certs to PGSSLROOTCERT for pg_dump/pg_restore', () => {
      const dir = mkdtempSync(join(tmpdir(), 'votar-ssl-'));
      const caPath = join(dir, 'ca.crt');
      writeFileSync(caPath, FAKE_CA_PEM);
      const get = makeGetter({ DB_SSL_MODE: 'verify-ca', DB_SSL_CA: caPath });
      expect(buildLibpqSslEnv(get)).toEqual({
        PGSSLMODE: 'verify-ca',
        PGSSLROOTCERT: caPath,
      });
    });

    it('omits inline PEM certs (libpq only accepts file paths)', () => {
      const get = makeGetter({
        DB_SSL_MODE: 'verify-ca',
        DB_SSL_CA: FAKE_CA_PEM,
      });
      expect(buildLibpqSslEnv(get)).toEqual({ PGSSLMODE: 'verify-ca' });
    });
  });
});
