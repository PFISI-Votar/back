import { BACKUP_RETENTION_DAYS_DEFAULT } from './backup.constants';
import {
  msUntilNextBackupHour,
  selectExpiredBackups,
} from './backup.retention';

describe('backup.retention (VOTAR-388)', () => {
  const dayMs = 24 * 60 * 60 * 1000;
  const now = Date.UTC(2026, 7, 31, 12, 0, 0);

  it('elimina respaldos más viejos que la retención de 30 días', () => {
    const expired = selectExpiredBackups(
      [
        { name: 'votar-old.dump.enc', mtimeMs: now - 31 * dayMs },
        { name: 'votar-keep.dump.enc', mtimeMs: now - 10 * dayMs },
        { name: 'notes.txt', mtimeMs: now - 100 * dayMs },
      ],
      BACKUP_RETENTION_DAYS_DEFAULT,
      now,
    );

    expect(expired).toEqual(['votar-old.dump.enc']);
  });

  it('no elimina nada si todos están dentro de la ventana', () => {
    const expired = selectExpiredBackups(
      [
        { name: 'a.dump.enc', mtimeMs: now - 1 * dayMs },
        { name: 'b.dump.enc', mtimeMs: now - 29 * dayMs },
      ],
      30,
      now,
    );
    expect(expired).toEqual([]);
  });

  it('calcula el delay hasta la próxima hora de baja carga', () => {
    const mondayMorning = new Date(2026, 7, 31, 1, 15, 0); // 01:15 local
    const delay = msUntilNextBackupHour(3, mondayMorning);
    // 01:15 → 03:00 = 1h45m = 6_300_000 ms
    expect(delay).toBe(1 * 60 * 60 * 1000 + 45 * 60 * 1000);

    const afterHour = new Date(2026, 7, 31, 3, 0, 1);
    const delayNextDay = msUntilNextBackupHour(3, afterHour);
    expect(delayNextDay).toBeGreaterThan(23 * 60 * 60 * 1000);
  });
});
