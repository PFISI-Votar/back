# VOTAR-388 — Automatización y resguardo de copias de seguridad en PostgreSQL

> **Historia:** respaldos diarios cifrados del PostgreSQL off-chain (padrón, configuración de comicios, audit log).  
> **Repositorio:** `PFISI-Votar/back`  
> **Directorio de artefactos:** `src/backups/`

---

## Qué implementa

| Criterio | Implementación |
| -------- | -------------- |
| Respaldo automatizado diario en baja carga | `BackupScheduler` (hora local `BACKUP_HOUR`, default **03:00**) gated por `BACKUP_ENABLED` |
| Cifrado en reposo | AES-256-GCM (`BACKUP_ENCRYPTION_KEY`) antes de persistir `*.dump.enc` |
| Almacenamiento remoto + retención ≥ 30 días | Copia opcional a `BACKUP_REMOTE_DIR` + poda automática (`BACKUP_RETENTION_DAYS=30`) |
| Alertas de fallo / integridad | Mail a `ALERT_EMAIL_TO` si `pg_dump` falla o el proceso aborta; checksum SHA-256 sidecar |
| Validación mensual de restauración (RTO) | `npm run db:restore` + procedimiento UAT abajo |

El volcado en claro **nunca** queda en disco al terminar: solo existe el archivo cifrado y su `.sha256`.

---

## Variables de entorno

Agregar en `.env` (ver `.env.example`):

```env
BACKUP_ENABLED=false
BACKUP_ENCRYPTION_KEY=cambiar-por-secreto-largo-o-64-hex
BACKUP_DIR=           # vacío = src/backups
BACKUP_REMOTE_DIR=    # ej. /mnt/offsite/votar-backups (otra ubicación geográfica / volumen)
BACKUP_RETENTION_DAYS=30
BACKUP_HOUR=3
BACKUP_RESTORE_DB=votar_restore
ALERT_EMAIL_TO=autoridad@institucion.edu.ar
```

`BACKUP_ENCRYPTION_KEY`: passphrase arbitraria (scrypt) **o** 64 caracteres hex (32 bytes crudos).

Para ubicación remota real (S3, GCS, otro datacenter): montar el bucket/FS en `BACKUP_REMOTE_DIR` o sincronizar ese path con el agente del cloud (rclone/aws s3 sync) fuera del proceso Node.

---

## Comandos

```bash
# Un respaldo inmediato (útil para cron externo o UAT)
npm run db:backup

# Restaurar en BD de prueba (la BD destino debe existir)
createdb votar_restore   # o: psql -c 'CREATE DATABASE votar_restore'
npm run db:restore -- src/backups/votar-<timestamp>.dump.enc votar_restore
```

Con `BACKUP_ENABLED=true` el API NestJS programa solo el backup diario; no hace falta cron externo.

Cron alternativo (sin dejar el scheduler en el API):

```cron
0 3 * * * cd /opt/votar/back && /usr/bin/npm run db:backup >> /var/log/votar-backup.log 2>&1
```

---

## Procedimiento mensual de recuperación (RTO)

1. Tomar el `*.dump.enc` más reciente de `BACKUP_REMOTE_DIR` (o de `src/backups/`).
2. Crear BD limpia: `createdb votar_restore`.
3. `npm run db:restore -- <archivo.dump.enc> votar_restore`.
4. Comparar conteos vs. reporte previo al backup (UAT-02):

```sql
-- en producción (solo lectura) y en votar_restore
SELECT 'votante' AS t, COUNT(*) FROM votante
UNION ALL SELECT 'audit_log', COUNT(*) FROM audit_log
UNION ALL SELECT 'eleccion', COUNT(*) FROM eleccion;
```

5. Registrar fecha, duración (RTO medido) y resultado en el acta de auditoría institucional.
6. Destruir `votar_restore` tras la prueba.

---

## UAT mapeado

| ID | Cómo verificarlo |
| -- | ---------------- |
| UAT-01 | `db:restore` sobre BD limpia reconstruye esquema y datos |
| UAT-02 | Conteos SQL cruzados producción vs. restaurado |
| UAT-03 | Forzar fallo (p. ej. `BACKUP_DIR` sin espacio / permiso) → mail a `ALERT_EMAIL_TO` |
| UAT-04 | Abrir `*.dump.enc` sin clave → ilegible; `decrypt` con clave incorrecta falla (auth tag GCM) |
