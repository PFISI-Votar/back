import { encryptedColumn } from './encrypted-column.transformer';
import { isEncrypted } from './field-encryption';

describe('encryptedColumn (VOTAR-498)', () => {
  afterEach(() => {
    delete process.env.DB_ENCRYPTION_KEY;
    delete process.env.DEVELOPMENT;
  });

  it('encrypts on write and decrypts back on read when a key is configured', () => {
    process.env.DB_ENCRYPTION_KEY = 'e'.repeat(64);
    const transformer = encryptedColumn();

    const stored = transformer.to('JBSWY3DPEHPK3PXP') as string;
    expect(isEncrypted(stored)).toBe(true);
    expect(stored).not.toContain('JBSWY3DPEHPK3PXP');

    expect(transformer.from(stored)).toBe('JBSWY3DPEHPK3PXP');
  });

  it('passes null/undefined through untouched in both directions', () => {
    process.env.DB_ENCRYPTION_KEY = 'e'.repeat(64);
    const transformer = encryptedColumn();

    expect(transformer.to(null)).toBeNull();
    expect(transformer.to(undefined)).toBeUndefined();
    expect(transformer.from(null)).toBeNull();
    expect(transformer.from(undefined)).toBeUndefined();
  });

  it('is a passthrough in development without a configured key', () => {
    process.env.DEVELOPMENT = 'true';
    const transformer = encryptedColumn();

    const stored = transformer.to('Autoridad Sin Clave') as string;
    expect(stored).toBe('Autoridad Sin Clave');
    expect(transformer.from(stored)).toBe('Autoridad Sin Clave');
  });

  it('reads a legacy plaintext value (pre-migración) without throwing', () => {
    process.env.DB_ENCRYPTION_KEY = 'e'.repeat(64);
    const transformer = encryptedColumn();

    expect(transformer.from('Juan Pérez')).toBe('Juan Pérez');
  });
});
