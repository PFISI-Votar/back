import {
  decryptBackup,
  deriveBackupKey,
  encryptBackup,
  looksEncrypted,
  sha256Hex,
} from './backup.crypto';

describe('backup.crypto (VOTAR-388)', () => {
  const key = deriveBackupKey('test-backup-passphrase-for-unit-tests');

  it('deriva 32 bytes desde passphrase y desde hex de 64 chars', () => {
    expect(key).toHaveLength(32);
    const hexKey = deriveBackupKey('a'.repeat(64));
    expect(hexKey).toHaveLength(32);
    expect(hexKey.equals(Buffer.from('a'.repeat(64), 'hex'))).toBe(true);
  });

  it('cifra y descifra un volcado preservando el contenido (UAT-01)', () => {
    const plain = Buffer.from('PGDUMP-FAKE-BINARY-CONTENT-\0\x01\x02');
    const encrypted = encryptBackup(plain, key);

    expect(looksEncrypted(encrypted)).toBe(true);
    expect(encrypted.equals(plain)).toBe(false);

    const restored = decryptBackup(encrypted, key);
    expect(restored.equals(plain)).toBe(true);
  });

  it('rechaza descifrado con clave incorrecta (UAT-04)', () => {
    const plain = Buffer.from('padrón electoral sensible');
    const encrypted = encryptBackup(plain, key);
    const wrongKey = deriveBackupKey('otra-clave-distinta');

    expect(() => decryptBackup(encrypted, wrongKey)).toThrow();
  });

  it('rechaza payloads truncados o sin magic', () => {
    expect(() => decryptBackup(Buffer.from('no-magic'), key)).toThrow(
      /desconocido|truncado/i,
    );
    expect(looksEncrypted(Buffer.from('plaintext-sql'))).toBe(false);
  });

  it('sha256Hex es determinista', () => {
    const data = Buffer.from('abc');
    expect(sha256Hex(data)).toBe(sha256Hex(data));
    expect(sha256Hex(data)).toHaveLength(64);
  });
});
