# VPS bajo demanda con auto-apagado (VOTAR-516)

Opción B del documento de Impacto Ambiental: la infraestructura del comicio
**no queda encendida todo el año**. Se levanta un VPS unos días antes del
comicio (12/11/2026), se aprovisiona con un solo script y la instancia se
apaga sola cuando, terminada la elección, deja de recibir tráfico.

## Archivos

| Archivo | Uso |
| --- | --- |
| `provision.sh` | Aprovisiona un Ubuntu 24.04 limpio. Idempotente: volver a correrlo actualiza código y config. |
| `idle-shutdown.sh` | Decide si apagar la instancia. Lo corre el timer cada 5 min. |
| `vps.env.example` | Configuración del VPS (dominios, repos, umbrales de apagado). |
| `systemd/votar-back.service` | Backend NestJS (`node dist/main`) como usuario `votar`. |
| `systemd/votar-idle-shutdown.{service,timer}` | Chequeo de inactividad cada 5 min, desde 15 min después del boot. |
| `nginx/votar.conf.template` | Reverse proxy del API (`:3000`) y del front (`:8080`); certbot agrega TLS. |

## Qué deja instalado `provision.sh`

1. Paquetes del sistema, Node.js 24, Docker, `unattended-upgrades`.
2. Firewall `ufw`: solo SSH, 80 y 443. PostgreSQL y el API escuchan en loopback.
3. PostgreSQL 16 con la config de VOTAR-498 (`../postgres/postgresql.conf`):
   TLS, `scram-sha-256`, `pg_hba` solo `hostssl` desde loopback para el rol de
   migraciones (`DB_USERNAME`) y el de runtime (`DB_APP_USERNAME`). La CA del
   servidor se genera en el propio host (`/etc/postgresql/votar-certs`): la base
   no sale del VPS y su único cliente es el backend local, que la verifica con
   `DB_SSL_MODE=verify-full`.
4. Rol de migraciones dueño de la base con `CREATEROLE` (sin `SUPERUSER`).
5. Backend clonado en `/opt/votar/back`: `npm ci`, `build`, `migrate` y
   servicio `votar-back`.
6. Front clonado en `/opt/votar/front`, imagen `front/deploy/Dockerfile`
   publicada solo en `127.0.0.1:8080`.
7. nginx + certificados Let's Encrypt para `API_DOMAIN` y `APP_DOMAIN`.
8. Timer `votar-idle-shutdown.timer`.

## Procedimiento antes del comicio

1. Crear el VPS (Ubuntu 24.04) y apuntar los registros DNS de `API_DOMAIN` y `APP_DOMAIN` a su IP.
2. Copiar al VPS el `.env` del backend con los **secretos reales** de
   producción (fuera del repo), por ejemplo en `/root/votar-back.env`.
   `provision.sh` fuerza `DEVELOPMENT=false`, `REQUIRE_HTTPS=true`,
   `FRONTEND_URL`, `PORT` y `DB_HOST/DB_PORT/DB_SSL_*`; el resto se toma tal cual.
   Registrar `https://<API_DOMAIN>/auth/votante/google/callback` en Google
   Cloud y en `GOOGLE_OAUTH_REDIRECT_URI` (VOTAR-523).
3. Ejecutar:

   ```bash
   git clone https://github.com/PFISI-Votar/back.git && cd back
   cp deploy/vps/vps.env.example /root/vps.env   # completar
   sudo deploy/vps/provision.sh /root/vps.env
   ```

4. Verificar: `systemctl status votar-back`, `docker ps`, `https://<APP_DOMAIN>`
   y `systemctl list-timers votar-idle-shutdown.timer`.
5. Probar el apagado sin apagar: `sudo DRY_RUN=true /opt/votar/bin/idle-shutdown.sh`.

Para actualizar código antes del comicio, volver a correr `provision.sh` (o
cambiar `BACK_REF`/`FRONT_REF` en `/etc/votar/vps.env` y correrlo).

## Regla de auto-apagado

`idle-shutdown.sh` apaga solo si se cumple **todo** lo siguiente. Ante
cualquier duda (base inaccesible, config inválida, respaldo fallido) **no
apaga** y sale con error, que queda en `journalctl -u votar-idle-shutdown`.

| # | Condición | Por qué |
| --- | --- | --- |
| 1 | Pasó `SHUTDOWN_NOT_BEFORE` (si está definido) | Piso de fecha: nunca apagar antes del fin previsto del comicio. |
| 2 | No hay elecciones `CONFIGURADA`, `ABIERTA` ni `CERRADA` (no eliminadas) | Una `CERRADA` todavía no fue escrutada; una `CONFIGURADA` está por abrir. |
| 3 | Sin tráfico HTTPS durante `IDLE_MINUTES` | Fiscales y observadores pueden seguir consultando resultados tras el escrutinio. |
| 4 | Respaldo cifrado OK (`BACKUP_BEFORE_SHUTDOWN=true`) | Usa `npm run db:backup` (VOTAR-388); la base se puede restaurar en la próxima instancia. |

Tráfico = conexiones establecidas a `:443` desde fuera del host, o escrituras
en `/var/log/nginx/votar-access.log`. El contador de inactividad empieza, como
mínimo, en el último boot, en `SHUTDOWN_NOT_BEFORE` y en el último chequeo con
elecciones pendientes: encender el VPS después del comicio (por ejemplo para
una auditoría) da siempre `IDLE_MINUTES` de margen.

Después del respaldo se ejecuta `SHUTDOWN_HOOK` si está definido y luego
`systemctl poweroff`. **En muchos proveedores una instancia apagada sigue
facturando** (y consumiendo disco reservado): configurar `SHUTDOWN_HOOK` con la
CLI del proveedor, o eliminar la instancia manualmente una vez copiados los
respaldos fuera de ella (`BACKUP_REMOTE_DIR`).

Desactivar el auto-apagado (por ejemplo, si se extiende el comicio):

```bash
sudo systemctl disable --now votar-idle-shutdown.timer
```

## Limitaciones conocidas

- Un monitor externo de disponibilidad que haga requests al VPS mantiene la
  instancia encendida (cuenta como tráfico). Apagarlo después del escrutinio.
- La rotación diaria de logs de nginx cambia la fecha del access log y cuenta
  como actividad: en el peor caso retrasa el apagado `IDLE_MINUTES`.
