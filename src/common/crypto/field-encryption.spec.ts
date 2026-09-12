import {
  FieldEncryptionKeyMissingError,
  decryptField,
  deriveFieldKey,
  encryptField,
  isEncrypted,
  resolveFieldKey,
} from './field-encryption';

describe('field-encryption (VOTAR-498)', () => {
  const key = deriveFieldKey('test-field-encryption-passphrase');

  afterEach(() => {
    delete process.env.DB_ENCRYPTION_KEY;
    delete process.env.DEVELOPMENT;
  });

  it('deriva 32 bytes desde passphrase y desde hex de 64 chars', () => {
    expect(key).toHaveLength(32);
    const hexKey = deriveFieldKey('b'.repeat(64));
    expect(hexKey).toHaveLength(32);
    expect(hexKey.equals(Buffer.from('b'.repeat(64), 'hex'))).toBe(true);
  });

  it('cifra y descifra preservando el contenido', () => {
    const plain = 'JBSWY3DPEHPK3PXP'; // secreto TOTP de ejemplo
    const encrypted = encryptField(plain, key);

    expect(isEncrypted(encrypted)).toBe(true);
    expect(encrypted).not.toBe(plain);
    expect(encrypted).not.toContain(plain);

    expect(decryptField(encrypted, key)).toBe(plain);
  });

  it('produce ciphertexts distintos para el mismo valor (IV aleatorio)', () => {
    const plain = 'Autoridad Electoral Ejemplo';
    const first = encryptField(plain, key);
    const second = encryptField(plain, key);
    expect(first).not.toBe(second);
    expect(decryptField(first, key)).toBe(plain);
    expect(decryptField(second, key)).toBe(plain);
  });

  it('rechaza descifrado con clave incorrecta (auth tag GCM)', () => {
    const encrypted = encryptField('dato sensible', key);
    const wrongKey = deriveFieldKey('otra-clave-distinta');
    expect(() => decryptField(encrypted, wrongKey)).toThrow();
  });

  it('rechaza valores sin el prefijo enc:v1: o truncados', () => {
    expect(() => decryptField('plain-value', key)).toThrow(/prefijo/);
    expect(() => decryptField('enc:v1:AA==', key)).toThrow(/truncado/);
  });

  it('isEncrypted distingue texto plano legacy de un valor cifrado', () => {
    expect(isEncrypted('Juan Pérez')).toBe(false);
    expect(isEncrypted(encryptField('Juan Pérez', key))).toBe(true);
  });

  describe('resolveFieldKey', () => {
    it('deriva la clave desde DB_ENCRYPTION_KEY cuando está configurada', () => {
      process.env.DB_ENCRYPTION_KEY = 'a'.repeat(64);
      const resolved = resolveFieldKey();
      expect(resolved).not.toBeNull();
      expect(resolved).toHaveLength(32);
    });

    it('devuelve null en desarrollo sin clave configurada (passthrough)', () => {
      process.env.DEVELOPMENT = 'true';
      expect(resolveFieldKey()).toBeNull();
    });

    it('lanza en producción sin clave configurada (fail-closed)', () => {
      process.env.DEVELOPMENT = 'false';
      expect(() => resolveFieldKey()).toThrow(FieldEncryptionKeyMissingError);
    });
  });
});
