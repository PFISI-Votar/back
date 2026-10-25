import {
  BACKUP_FILE_SUFFIX,
  BACKUP_RETENTION_DAYS_DEFAULT,
} from './backup.constants';

export interface BackupFileMeta {
  name: string;
  mtimeMs: number;
}

/**
 * Selecciona respaldos cuya mtime supera la ventana de retención.
 * Conserva siempre los archivos más recientes dentro de `retentionDays`.
 */
export const selectExpiredBackups = (
  files: BackupFileMeta[],
  retentionDays: number = BACKUP_RETENTION_DAYS_DEFAULT,
  nowMs: number = Date.now(),
): string[] => {
  const cutoff = nowMs - retentionDays * 24 * 60 * 60 * 1000;
  return files
    .filter(
      (file) => file.name.endsWith(BACKUP_FILE_SUFFIX) && file.mtimeMs < cutoff,
    )
    .map((file) => file.name);
};

/** Próximo instante (ms epoch) para la hora local de baja carga configurada. */
export const msUntilNextBackupHour = (
  hourLocal: number,
  now: Date = new Date(),
): number => {
  const normalizedHour = ((hourLocal % 24) + 24) % 24;
  const next = new Date(now);
  next.setSeconds(0, 0);
  next.setMinutes(0);
  next.setHours(normalizedHour);
  if (next.getTime() <= now.getTime()) {
    next.setDate(next.getDate() + 1);
  }
  return next.getTime() - now.getTime();
};
