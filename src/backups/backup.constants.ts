import { resolve } from 'node:path';

/** Prefijo de archivo cifrado VOTAR (AES-256-GCM). */
export const BACKUP_MAGIC = Buffer.from('VOTARBK1', 'ascii');

/** Extensión de respaldos cifrados en disco. */
export const BACKUP_FILE_SUFFIX = '.dump.enc';

/** Extensión del sidecar de integridad (SHA-256 hex). */
export const BACKUP_CHECKSUM_SUFFIX = '.sha256';

/** Retención mínima exigida por VOTAR-388 (días). */
export const BACKUP_RETENTION_DAYS_DEFAULT = 30;

/** Hora local de baja carga por defecto (03:00). */
export const BACKUP_HOUR_DEFAULT = 3;

/** Directorio local de respaldos (relativo al cwd del backend). */
export const DEFAULT_BACKUP_DIR = resolve(process.cwd(), 'src', 'backups');
