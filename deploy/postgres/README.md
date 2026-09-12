# Hardening de PostgreSQL (VOTAR-498)

Configuración versionada para cerrar los tres riesgos que reportó el análisis
Threagile sobre la base de datos. Ver también `back/docs/VOTAR-498-hardening-db.md`
para el detalle de variables de entorno y procedimientos, y
`../firewall/` para el bloqueo a nivel de red.

| Riesgo Threagile | Mitigado por |
| --- | --- |
| `unencrypted-communication` | `postgresql.conf` (TLS del servidor) + `src/config/database-ssl.config.ts` (TLS del cliente: TypeORM runtime, migraciones, `pg_dump`/`pg_restore`) |
| `unencrypted-asset` | `src/common/crypto/` + `encryptedColumn()` en las entidades (columna cifrada AES-256-GCM) — ver el doc en `back/docs/` |
| `unguarded-direct-datastore-access` | `pg_hba.conf` / `pg_hba.dev.conf` (solo el backend, solo TLS) + `../firewall/` (bloqueo de red) |

## Archivos

| Archivo | Uso |
| --- | --- |
| `postgresql.conf` | Fragmento de configuración del servidor (TLS, `scram-sha-256`, logging de conexiones). Producción y desarrollo. |
| `pg_hba.conf` | Reglas de acceso de **producción**: `hostssl` + certificado de cliente (`clientcert=verify-ca`) desde el CIDR del backend únicamente. Placeholders `<DB_NAME>`, `<DB_APP_USER>`, `<BACKEND_CIDR>` a reemplazar antes de desplegar. |
| `pg_hba.dev.conf` | Reglas de acceso de **desarrollo**: `hostssl` sin certificado de cliente (no obliga a emitir certs de cliente para levantar el stack local). |
| `generate-dev-certs.sh` | Genera CA + certificado de servidor self-signed en `certs/` (gitignored) para desarrollo. `npm run db:certs` desde `back/`. **No usar en producción** — ahí el certificado debe emitirlo la CA institucional. |
| `docker-compose.db-tls.yml` | Plantilla de override para el servicio `db` del `docker-compose.yml` de la raíz del monorepo (no versionado en ningún repo). Ver instrucciones abajo. |

## Cómo aplicar en desarrollo

El `docker-compose.yml` de la raíz **no se modifica** en esta US — el equipo
lo usa tal cual con pgAdmin/DBeaver y no está versionado en ningún repo. En
su lugar, esta plantilla se copia como override local:

```bash
cd back && npm run db:certs
cd ..
cp back/deploy/postgres/docker-compose.db-tls.yml docker-compose.override.yml
docker compose up -d db
```

`docker-compose.override.yml` ya está en el `.gitignore` de la raíz —
`docker compose` lo combina automáticamente con `docker-compose.yml` sin
necesidad de `-f` explícito. En `back/.env`:

```env
DB_SSL_MODE=verify-ca
DB_SSL_CA=deploy/postgres/certs/ca.crt
```

## Cómo aplicar en producción

1. Reemplazar los placeholders de `pg_hba.conf` (`<DB_NAME>`, `<DB_APP_USER>`,
   `<BACKEND_CIDR>`) con los valores reales del entorno.
2. Emitir el certificado de servidor con la CA institucional (no usar
   `generate-dev-certs.sh`) y montarlo donde `postgresql.conf` espera
   (`/etc/postgresql/certs/`).
3. Aplicar `../firewall/votar-db.nft` (o `votar-db-ufw.sh`) en el host de la
   base, reemplazando `<BACKEND_IP>` por la IP real del backend.
4. Confirmar con `psql` desde un origen no autorizado que la conexión es
   rechazada (ver `back/docs/VOTAR-498-hardening-db.md` § Verificación).

## Por qué el puerto de la DB sigue publicado en dev

Publicar el puerto (`docker-compose.yml:22`, `${DB_HOST_PORT:-5434}:5432`) no
es en sí el riesgo — es el acceso **sin TLS y sin restricción de origen** lo
que Threagile marca. En desarrollo, con `pg_hba.dev.conf` aplicado, cualquier
intento de conexión sin TLS (`PGSSLMODE=disable`) es rechazado por el
servidor aunque el puerto esté accesible desde el host. En producción, el
puerto no debería publicarse hacia una red que no sea la del backend —
responsabilidad del equipo de infraestructura al desplegar, fuera del
alcance de este repo.
