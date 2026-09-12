import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from 'node:crypto';

/**
 * VOTAR-498 — cifrado AES-256-GCM a nivel de columna para secretos y PII que
 * no se consultan como criterio de búsqueda (totp_secret, nombre, email de
 * refresh_session). Mitiga el riesgo Threagile `unencrypted-asset`.
 *
 * Mismas primitivas que `src/backups/backup.crypto.ts` (AES-256-GCM sobre
 * `node:crypto`), pero con una sal de derivación propia (`votar-field-v1`)
 * para que rotar `DB_ENCRYPTION_KEY` no afecte a `BACKUP_ENCRYPTION_KEY` ni
 * viceversa — son secretos con alcance distinto (separación de funciones).
 *
 * Se elige cifrado del lado de la aplicación en vez de `pgcrypto`: con
 * `pgcrypto` la clave viaja al motor como parte de la sentencia SQL y queda
 * expuesta en `log_statement`/`pg_stat_activity`, justo el actor
 * (acceso directo a la base) que este control busca sacar del alcance.
 *
 * Formato de valor cifrado: `enc:v1:<base64(iv[12] | authTag[16] | ciphertext)>`.
 * El prefijo permite decidir en `from()` si un valor ya está cifrado
 * (tolerante a filas en claro previas a la migración de backfill).
 */
const ENC_PREFIX = 'enc:v1:';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;

export class FieldEncryptionKeyMissingError extends Error {
  constructor() {
    super(
      'VOTAR-498: DB_ENCRYPTION_KEY no está configurada. Requerida en producción ' +
        '(DEVELOPMENT=false) para cifrar columnas sensibles.',
    );
    this.name = 'FieldEncryptionKeyMissingError';
  }
}

export const deriveFieldKey = (secret: string): Buffer => {
  const trimmed = secret.trim();
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return Buffer.from(trimmed, 'hex');
  }
  return scryptSync(trimmed, 'votar-field-v1', KEY_LENGTH);
};

/**
 * Lee `DB_ENCRYPTION_KEY` de `process.env` en el momento del uso (no en
 * tiempo de import/decorador), para que los tests puedan setearla antes de
 * cada caso y para no romper el arranque de módulos que no tocan columnas
 * cifradas antes de que `ConfigModule` termine de cargar `.env`.
 *
 * - Producción (`DEVELOPMENT !== 'true'`) sin clave configurada → lanza.
 * - Desarrollo sin clave configurada → `null` (passthrough en claro; permite
 *   levantar el stack local sin generar una clave todavía).
 */
export const resolveFieldKey = (): Buffer | null => {
  const secret = process.env.DB_ENCRYPTION_KEY;
  if (secret?.trim()) return deriveFieldKey(secret);
  if (process.env.DEVELOPMENT === 'true') return null;
  throw new FieldEncryptionKeyMissingError();
};

export const isEncrypted = (value: string): boolean =>
  value.startsWith(ENC_PREFIX);

export const encryptField = (plaintext: string, key: Buffer): string => {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  const payload = Buffer.concat([iv, authTag, ciphertext]);
  return `${ENC_PREFIX}${payload.toString('base64')}`;
};

export const decryptField = (value: string, key: Buffer): string => {
  if (!isEncrypted(value)) {
    throw new Error('VOTAR-498: valor sin el prefijo esperado (enc:v1:).');
  }
  const payload = Buffer.from(value.slice(ENC_PREFIX.length), 'base64');
  const headerLen = IV_LENGTH + AUTH_TAG_LENGTH;
  if (payload.length < headerLen) {
    throw new Error('VOTAR-498: valor cifrado truncado o corrupto.');
  }
  const iv = payload.subarray(0, IV_LENGTH);
  const authTag = payload.subarray(IV_LENGTH, headerLen);
  const ciphertext = payload.subarray(headerLen);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString('utf8');
};
