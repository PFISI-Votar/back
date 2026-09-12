# VOTAR-498 — Hardening integral de base de datos y encriptación en reposo

> **Historia:** el análisis Threagile reportó tres riesgos abiertos sobre PostgreSQL: comunicación sin cifrar, activos sin cifrar en reposo y acceso directo al datastore sin vigilancia.
> **Repositorio:** `PFISI-Votar/back`
> **Directorios de artefactos:** `src/config/database-ssl.config.ts`, `src/common/crypto/`, `deploy/postgres/`, `deploy/firewall/`

---

## Qué implementa

| Riesgo Threagile | Implementación |
| --- | --- |
| `unencrypted-communication` | TLS obligatorio en las tres rutas de conexión a PostgreSQL: TypeORM runtime (`src/config/database.config.ts`), CLI de migraciones (`src/database/data-source.ts`) y subprocesos `pg_dump`/`pg_restore` (`src/backups/services/backup.service.ts`). Fail-closed: en producción (`DEVELOPMENT=false`) el arranque aborta si `DB_SSL_MODE=disable` o si falta `DB_SSL_CA` en modo `verify-ca`/`verify-full`. |
| `unencrypted-asset` (columnas) | Cifrado AES-256-GCM a nivel de columna (`src/common/crypto/field-encryption.ts` + `encryptedColumn()` transformer de TypeORM) sobre `autoridad_electoral.totp_secret`, `autoridad_electoral.nombre`, `refresh_session.email` y `refresh_session.nombre`. |
| `unguarded-direct-datastore-access` | Configuración versionada de PostgreSQL (`deploy/postgres/`: TLS del servidor, `pg_hba.conf` restringido al backend, `scram-sha-256`) + reglas de firewall (`deploy/firewall/`) que limitan el puerto 5432 al host del backend. |

El respaldo cifrado (VOTAR-388, AES-256-GCM sobre el `.dump`) ya cubría el archivo de backup; esta US cubre la base **viva**.

---

## Por qué `autoridad_electoral.email` queda en claro

Es la clave de búsqueda del login SSO (`AuthService.findOrCreateAutoridad`,
`where: [{ identificadorSso }, { email }]`). Cifrarla con el mismo esquema no
determinista rompería esa búsqueda; requeriría un blind index (`email_hash`
= HMAC-SHA256 indexado) que toca `auth.service.ts`, seeds y
`scripts/lib/election-admin.mjs` — fuera del alcance decidido para esta US.
Queda documentada como excepción, cubierta por el cifrado de volumen/disco
del proveedor (fuera del alcance de este repo — ver "Pendiente manual").

---

## Variables de entorno

Agregar en `.env` (ver `.env.example`):

```env
# TLS hacia PostgreSQL
DB_SSL_MODE=verify-ca          # disable | require | verify-ca | verify-full
DB_SSL_CA=deploy/postgres/certs/ca.crt   # ruta de archivo o PEM inline
DB_SSL_CERT=                    # certificado de cliente (mTLS opcional)
DB_SSL_KEY=                     # clave privada del certificado de cliente
DB_SSL_SERVERNAME=              # hostname esperado (solo verify-full)

# Cifrado de columnas
DB_ENCRYPTION_KEY=cambiar-por-secreto-largo-o-64-hex
```

`DB_SSL_MODE=disable` solo es válido cuando `DEVELOPMENT=true`. En
producción se exige `verify-ca` o `verify-full`, y `DB_ENCRYPTION_KEY` es
obligatoria (arranque falla si falta cualquiera de las dos).

`DB_ENCRYPTION_KEY` admite passphrase arbitraria (scrypt) o 64 caracteres hex
(32 bytes crudos) — mismo formato que `BACKUP_ENCRYPTION_KEY`, pero es un
secreto **distinto**: no reusar uno para el otro (separación de funciones).

---

## Comandos

```bash
# Generar CA + certificado de servidor self-signed para desarrollo
npm run db:certs

# Aplicar TLS al stack de desarrollo (docker-compose.yml de la raíz no se
# modifica; se usa un override local, ver deploy/postgres/README.md)
cp deploy/postgres/docker-compose.db-tls.yml ../docker-compose.override.yml
cd .. && docker compose up -d db && cd back

# Migrar (incluye el backfill de cifrado de columnas)
npm run migrate
```

---

## Rotación de `DB_ENCRYPTION_KEY`

1. Generar la nueva clave.
2. Con **ambas** claves disponibles temporalmente: correr un script one-off
   que lea cada fila con la clave vieja (`decryptField`) y la reescriba con
   la nueva (`encryptField`) — mismo patrón que el backfill de
   `1787600000000-CifradoEnReposoPii.ts`.
3. Reemplazar `DB_ENCRYPTION_KEY` en el entorno y reiniciar el backend.
4. Confirmar con el UAT de abajo que las columnas siguen legibles.

No hay downtime si se hace por lotes: el transformer solo falla si el
ciphertext no corresponde a la clave activa en el momento de la lectura.

---

## UAT mapeado

| ID | Cómo verificarlo |
| -- | ----------------- |
| UAT-01 | `SELECT ssl, version FROM pg_stat_ssl JOIN pg_stat_activity USING (pid) WHERE datname = current_database();` → `ssl = t`, `version >= TLSv1.2` |
| UAT-02 | `SELECT totp_secret, nombre FROM autoridad_electoral LIMIT 5;` → ambos valores empiezan con `enc:v1:`, ningún secreto TOTP legible |
| UAT-03 | `PGSSLMODE=disable psql -h <host> -p <port> -U <user> <db>` desde un cliente → rechazado por `pg_hba.conf` (`hostnossl ... reject`) |
| UAT-04 | `DEVELOPMENT=false DB_SSL_MODE=disable npm run start:prod` → el arranque aborta citando VOTAR-498 (fail-closed) |
| UAT-05 | `DEVELOPMENT=false DB_SSL_MODE=verify-full npm run start:prod` sin `DB_SSL_CA` → el arranque aborta |
| UAT-06 | Test de integración `test/cifrado-en-reposo.integration-spec.ts`: inserta una autoridad y confirma que la columna cruda (SQL directo) nunca contiene el secreto en claro |

---

## Referencias

- `deploy/postgres/README.md` — mapeo detallado de cada archivo de configuración a su riesgo Threagile.
- `deploy/firewall/` — reglas nftables/ufw para el host de la base.
- `docs/VOTAR-388-backup-restore.md` — cifrado de los respaldos (`.dump.enc`), complementario a este hardening.
