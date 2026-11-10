# Respaldos PostgreSQL cifrados (VOTAR-388)

Este directorio almacena los volcados diarios cifrados de la base de datos
(`*.dump.enc` + sidecar `*.sha256`). Los artefactos están gitignored.

## Uso rápido

```bash
# Generar un respaldo cifrado ahora (requiere pg_dump + BACKUP_ENCRYPTION_KEY)
npm run db:backup

# Restaurar un respaldo en una BD de prueba limpia
npm run db:restore -- src/backups/votar-2026-08-31T06-00-00.dump.enc
```

Ver `docs/VOTAR-388-backup-restore.md` para el procedimiento de validación
mensual (RTO), cifrado, retención de 30 días y alertas.
