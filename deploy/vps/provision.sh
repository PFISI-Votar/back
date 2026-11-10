#!/usr/bin/env bash
# VOTAR-516 — aprovisionamiento del VPS bajo demanda (Opción B de Impacto
# Ambiental) para el comicio del 12/11/2026.
#
# Deja en un Ubuntu 24.04 limpio: PostgreSQL 16 con TLS, backend NestJS como
# servicio systemd, front (imagen nginx de front/deploy) en Docker, nginx con
# TLS de Let's Encrypt, firewall y el timer de auto-apagado por inactividad.
# Es idempotente: se puede volver a correr para actualizar código o config.
#
# Uso (como root, desde un clon de este repo):
#   cp deploy/vps/vps.env.example /root/vps.env   # completar
#   sudo deploy/vps/provision.sh /root/vps.env
set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
VPS_ENV_SRC="${1:-/etc/votar/vps.env}"

APP_USER=votar
APP_HOME=/opt/votar
BACK_DIR=$APP_HOME/back
FRONT_DIR=$APP_HOME/front
PG_VERSION=16
PG_CERTS=/etc/postgresql/votar-certs
NODE_MAJOR=24

log() { echo -e "\n==> $*"; }
die() { echo "ERROR: $*" >&2; exit 1; }

# --- 0. Precondiciones ---

[[ $EUID -eq 0 ]] || die "Correr como root (sudo)."
. /etc/os-release
[[ "${ID:-}" == "ubuntu" && "${VERSION_ID:-}" == "24.04" ]] \
  || echo "AVISO: probado en Ubuntu 24.04; este host es ${PRETTY_NAME:-desconocido}."

[[ -f "$VPS_ENV_SRC" ]] || die "No existe $VPS_ENV_SRC. Copiar deploy/vps/vps.env.example y completarlo."
# shellcheck source=/dev/null
. "$VPS_ENV_SRC"

for var in API_DOMAIN APP_DOMAIN CERTBOT_EMAIL BACK_REPO BACK_REF FRONT_REPO FRONT_REF BACK_ENV_FILE; do
  [[ -n "${!var:-}" ]] || die "Falta $var en $VPS_ENV_SRC."
done
[[ -f "$BACK_ENV_FILE" ]] || die "No existe BACK_ENV_FILE=$BACK_ENV_FILE (el .env del backend con los secretos reales)."

# Lee una clave del .env del backend (sin evaluarlo como shell).
env_get() { sed -n "s/^$1=//p" "$2" | tail -1 | sed -e 's/^["'\'']//' -e 's/["'\'']$//'; }

# Reemplaza o agrega KEY=VALUE en un archivo .env.
env_set() {
  local key=$1 value=$2 file=$3
  if grep -q "^$key=" "$file"; then
    sed -i "s|^$key=.*|$key=$value|" "$file"
  else
    echo "$key=$value" >>"$file"
  fi
}

DB_NAME=$(env_get DB_NAME "$BACK_ENV_FILE")
DB_USERNAME=$(env_get DB_USERNAME "$BACK_ENV_FILE")
DB_PASSWORD=$(env_get DB_PASSWORD "$BACK_ENV_FILE")
DB_APP_USERNAME=$(env_get DB_APP_USERNAME "$BACK_ENV_FILE")
for var in DB_NAME DB_USERNAME DB_PASSWORD DB_APP_USERNAME; do
  [[ -n "${!var}" ]] || die "Falta $var en $BACK_ENV_FILE."
done
[[ "$DB_USERNAME" =~ ^[a-z_][a-z0-9_]*$ && "$DB_NAME" =~ ^[a-z_][a-z0-9_]*$ && "$DB_APP_USERNAME" =~ ^[a-z_][a-z0-9_]*$ ]] \
  || die "DB_NAME, DB_USERNAME y DB_APP_USERNAME deben ser identificadores simples (a-z, 0-9, _)."
[[ "$DB_PASSWORD" != "postgres" ]] || die "DB_PASSWORD no puede ser el default de desarrollo."

# --- 1. Paquetes base ---

log "Instalando paquetes del sistema"
export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get install -y -q ca-certificates curl git gnupg openssl ufw \
  nginx certbot python3-certbot-nginx \
  "postgresql-$PG_VERSION" postgresql-client-"$PG_VERSION" \
  docker.io unattended-upgrades

if ! command -v node >/dev/null || [[ "$(node -p 'process.versions.node.split(".")[0]')" != "$NODE_MAJOR" ]]; then
  log "Instalando Node.js $NODE_MAJOR (NodeSource)"
  install -d -m 0755 /etc/apt/keyrings
  curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
    | gpg --dearmor --yes -o /etc/apt/keyrings/nodesource.gpg
  echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_$NODE_MAJOR.x nodistro main" \
    >/etc/apt/sources.list.d/nodesource.list
  apt-get update -q
  apt-get install -y -q nodejs
fi

systemctl enable --now docker unattended-upgrades

# --- 2. Usuario de la aplicación ---

if ! id "$APP_USER" >/dev/null 2>&1; then
  log "Creando usuario de sistema $APP_USER"
  useradd --system --home-dir "$APP_HOME" --create-home --shell /usr/sbin/nologin "$APP_USER"
fi
install -d -o "$APP_USER" -g "$APP_USER" -m 0750 "$APP_HOME"
install -d -m 0755 "$APP_HOME/bin"
install -d -m 0750 /etc/votar
if [[ "$(realpath "$VPS_ENV_SRC")" != "/etc/votar/vps.env" ]]; then
  install -m 0640 "$VPS_ENV_SRC" /etc/votar/vps.env
fi

# --- 3. Firewall: solo SSH y HTTP(S). PostgreSQL y el API (:3000) quedan en loopback ---

log "Configurando firewall (ufw)"
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

# --- 4. PostgreSQL con TLS (VOTAR-498) ---

log "Configurando PostgreSQL $PG_VERSION"
install -d -o postgres -g postgres -m 0750 "$PG_CERTS"
if [[ ! -f "$PG_CERTS/server.crt" ]]; then
  # CA propia del host: la base solo escucha en loopback y el único cliente es
  # el backend de este mismo VPS, que confía en esta CA vía DB_SSL_CA.
  openssl genrsa -out "$PG_CERTS/ca.key" 4096
  openssl req -x509 -new -nodes -key "$PG_CERTS/ca.key" -sha256 -days 825 \
    -subj "/O=VOTAR/CN=VOTAR VPS DB CA" -out "$PG_CERTS/ca.crt"
  openssl genrsa -out "$PG_CERTS/server.key" 2048
  openssl req -new -key "$PG_CERTS/server.key" -subj "/O=VOTAR/CN=localhost" \
    -out "$PG_CERTS/server.csr"
  printf 'subjectAltName = DNS:localhost,IP:127.0.0.1,IP:::1\nextendedKeyUsage = serverAuth\n' \
    >"$PG_CERTS/server.ext"
  openssl x509 -req -in "$PG_CERTS/server.csr" -CA "$PG_CERTS/ca.crt" -CAkey "$PG_CERTS/ca.key" \
    -CAcreateserial -days 825 -sha256 -extfile "$PG_CERTS/server.ext" -out "$PG_CERTS/server.crt"
  rm -f "$PG_CERTS/server.csr" "$PG_CERTS/server.ext" "$PG_CERTS/ca.srl"
  chown postgres:postgres "$PG_CERTS"/*
  chmod 600 "$PG_CERTS/server.key" "$PG_CERTS/ca.key"
  chmod 644 "$PG_CERTS/server.crt" "$PG_CERTS/ca.crt"
fi
# El backend (usuario votar) necesita leer la CA para verificar el servidor.
chmod 0755 "$PG_CERTS"

PG_CONF_DIR=/etc/postgresql/$PG_VERSION/main
sed -e "s|/etc/postgresql/certs|$PG_CERTS|g" "$SCRIPT_DIR/../postgres/postgresql.conf" \
  >"$PG_CONF_DIR/conf.d/votar.conf"
echo "listen_addresses = 'localhost'" >>"$PG_CONF_DIR/conf.d/votar.conf"

cat >"$PG_CONF_DIR/pg_hba.conf" <<EOF
# VOTAR-516 — generado por deploy/vps/provision.sh a partir de
# deploy/postgres/pg_hba.conf (VOTAR-498). Solo el backend local, solo TLS.
# TYPE   DATABASE      USER                 ADDRESS        METHOD
hostssl  $DB_NAME      $DB_USERNAME         127.0.0.1/32   scram-sha-256
hostssl  $DB_NAME      $DB_USERNAME         ::1/128        scram-sha-256
hostssl  $DB_NAME      $DB_APP_USERNAME     127.0.0.1/32   scram-sha-256
hostssl  $DB_NAME      $DB_APP_USERNAME     ::1/128        scram-sha-256
local    all           postgres                            peer
local    all           all                                 reject
hostnossl all          all                  all            reject
host     all           all                  all            reject
EOF
systemctl restart postgresql

# Rol de migraciones: dueño de la base + CREATEROLE (la migración
# AuditLogRoleHardening crea el rol de runtime DB_APP_USERNAME). Sin SUPERUSER.
runuser -u postgres -- psql -X -v ON_ERROR_STOP=1 -q \
  -v role="$DB_USERNAME" -v pass="$DB_PASSWORD" -v db="$DB_NAME" <<'SQL'
SELECT format('CREATE ROLE %I LOGIN', :'role')
  WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'role') \gexec
ALTER ROLE :"role" WITH LOGIN CREATEROLE NOSUPERUSER PASSWORD :'pass';
SELECT format('CREATE DATABASE %I OWNER %I', :'db', :'role')
  WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = :'db') \gexec
SQL

# --- 5. Backend ---

log "Desplegando backend ($BACK_REF)"
if [[ ! -d "$BACK_DIR/.git" ]]; then
  runuser -u "$APP_USER" -- git clone --quiet "$BACK_REPO" "$BACK_DIR"
fi
runuser -u "$APP_USER" -- git -C "$BACK_DIR" fetch --quiet --all --tags
runuser -u "$APP_USER" -- git -C "$BACK_DIR" checkout --quiet --force "$BACK_REF"
runuser -u "$APP_USER" -- git -C "$BACK_DIR" reset --quiet --hard "origin/$BACK_REF" 2>/dev/null || true

install -o "$APP_USER" -g "$APP_USER" -m 0600 "$BACK_ENV_FILE" "$BACK_DIR/.env"
env_set DEVELOPMENT false "$BACK_DIR/.env"
env_set REQUIRE_HTTPS true "$BACK_DIR/.env"
env_set PORT 3000 "$BACK_DIR/.env"
env_set FRONTEND_URL "https://$APP_DOMAIN" "$BACK_DIR/.env"
env_set DB_HOST 127.0.0.1 "$BACK_DIR/.env"
env_set DB_PORT 5432 "$BACK_DIR/.env"
env_set DB_SSL_MODE verify-full "$BACK_DIR/.env"
env_set DB_SSL_CA "$PG_CERTS/ca.crt" "$BACK_DIR/.env"
# Vacío: Node no admite SNI con IP; verify-full valida 127.0.0.1 contra el SAN.
env_set DB_SSL_SERVERNAME "" "$BACK_DIR/.env"

runuser -u "$APP_USER" -- bash -c "cd '$BACK_DIR' && npm ci --no-audit --no-fund && npm run build && npm run migrate"

install -m 0644 "$SCRIPT_DIR/systemd/votar-back.service" /etc/systemd/system/votar-back.service
systemctl daemon-reload
systemctl enable votar-back
systemctl restart votar-back

# --- 6. Front (imagen de front/deploy/Dockerfile, solo en loopback) ---

log "Desplegando front ($FRONT_REF)"
if [[ ! -d "$FRONT_DIR/.git" ]]; then
  git clone --quiet "$FRONT_REPO" "$FRONT_DIR"
fi
git -C "$FRONT_DIR" fetch --quiet --all --tags
git -C "$FRONT_DIR" checkout --quiet --force "$FRONT_REF"
git -C "$FRONT_DIR" reset --quiet --hard "origin/$FRONT_REF" 2>/dev/null || true

docker build --quiet -f "$FRONT_DIR/deploy/Dockerfile" \
  --build-arg VITE_API_URL="https://$API_DOMAIN" \
  --build-arg VITE_RPC_URL="${FRONT_VITE_RPC_URL:-}" \
  --build-arg VITE_RPC_FALLBACK_URLS="${FRONT_VITE_RPC_FALLBACK_URLS:-}" \
  -t votar-front:latest "$FRONT_DIR"
docker rm -f votar-front >/dev/null 2>&1 || true
docker run -d --name votar-front --restart unless-stopped \
  -p 127.0.0.1:8080:80 \
  -e API_ORIGIN="https://$API_DOMAIN" \
  -e RPC_ORIGINS="${FRONT_RPC_ORIGINS:-}" \
  votar-front:latest >/dev/null

# --- 7. nginx + TLS ---

log "Configurando nginx y certificados TLS"
sed -e "s|__API_DOMAIN__|$API_DOMAIN|g" -e "s|__APP_DOMAIN__|$APP_DOMAIN|g" \
  "$SCRIPT_DIR/nginx/votar.conf.template" >/etc/nginx/sites-available/votar.conf
ln -sf /etc/nginx/sites-available/votar.conf /etc/nginx/sites-enabled/votar.conf
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx
certbot --nginx --non-interactive --agree-tos --redirect \
  -m "$CERTBOT_EMAIL" -d "$API_DOMAIN" -d "$APP_DOMAIN"

# --- 8. Auto-apagado por inactividad post-electoral ---

log "Instalando timer de auto-apagado"
install -m 0755 "$SCRIPT_DIR/idle-shutdown.sh" "$APP_HOME/bin/idle-shutdown.sh"
install -m 0644 "$SCRIPT_DIR/systemd/votar-idle-shutdown.service" /etc/systemd/system/
install -m 0644 "$SCRIPT_DIR/systemd/votar-idle-shutdown.timer" /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now votar-idle-shutdown.timer

# --- 9. Verificación ---

log "Verificando"
sleep 5
systemctl is-active --quiet votar-back || die "votar-back no está activo: journalctl -u votar-back"
api_code=$(curl -s -o /dev/null -w '%{http_code}' "https://$API_DOMAIN/" || true)
app_code=$(curl -s -o /dev/null -w '%{http_code}' "https://$APP_DOMAIN/" || true)
echo "API  https://$API_DOMAIN -> HTTP $api_code"
echo "Front https://$APP_DOMAIN -> HTTP $app_code"
[[ "$app_code" == "200" ]] || echo "AVISO: el front no respondió 200; revisar 'docker logs votar-front'."
systemctl list-timers votar-idle-shutdown.timer --no-pager

log "Listo. Logs: journalctl -u votar-back -u votar-idle-shutdown -f"
