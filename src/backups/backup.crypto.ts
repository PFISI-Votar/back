import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  scryptSync,
} from 'node:crypto';
import { BACKUP_MAGIC } from './backup.constants';

const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;

/**
 * Deriva una clave AES-256 a partir del secreto configurado.
 * Acepta 64 hex chars (32 bytes) o cualquier passphrase (scrypt).
 */
export const deriveBackupKey = (secret: string): Buffer => {
  const trimmed = secret.trim();
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return Buffer.from(trimmed, 'hex');
  }
  return scryptSync(trimmed, 'votar-backup-v1', KEY_LENGTH);
};

export const sha256Hex = (data: Buffer): string =>
  createHash('sha256').update(data).digest('hex');

/**
 * Cifra un volcado con AES-256-GCM.
 * Formato: MAGIC(8) | IV(12) | AUTH_TAG(16) | CIPHERTEXT
 */
export const encryptBackup = (plaintext: Buffer, key: Buffer): Buffer => {
  if (key.length !== KEY_LENGTH) {
    throw new Error('La clave de cifrado debe tener 32 bytes (AES-256).');
  }
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([BACKUP_MAGIC, iv, authTag, ciphertext]);
};

/**
 * Descifra un archivo producido por {@link encryptBackup}.
 * Lanza si el magic, la etiqueta de autenticación o la clave no coinciden.
 */
export const decryptBackup = (payload: Buffer, key: Buffer): Buffer => {
  if (key.length !== KEY_LENGTH) {
    throw new Error('La clave de cifrado debe tener 32 bytes (AES-256).');
  }
  const headerLen = BACKUP_MAGIC.length + IV_LENGTH + AUTH_TAG_LENGTH;
  if (payload.length < headerLen) {
    throw new Error('Archivo de respaldo truncado o corrupto.');
  }
  const magic = payload.subarray(0, BACKUP_MAGIC.length);
  if (!magic.equals(BACKUP_MAGIC)) {
    throw new Error('Formato de respaldo desconocido (magic inválido).');
  }
  const iv = payload.subarray(
    BACKUP_MAGIC.length,
    BACKUP_MAGIC.length + IV_LENGTH,
  );
  const authTag = payload.subarray(BACKUP_MAGIC.length + IV_LENGTH, headerLen);
  const ciphertext = payload.subarray(headerLen);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
};

/** Comprueba que el payload comience con el magic VOTAR (está cifrado). */
export const looksEncrypted = (payload: Buffer): boolean =>
  payload.length >= BACKUP_MAGIC.length &&
  payload.subarray(0, BACKUP_MAGIC.length).equals(BACKUP_MAGIC);
