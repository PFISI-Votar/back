#!/usr/bin/env bash
# VOTAR-516 — apagado automático del VPS por inactividad post-electoral.
#
# Lo ejecuta votar-idle-shutdown.timer cada 5 minutos. Apaga la instancia solo
# si se cumplen TODAS las condiciones (cualquier duda => no apaga):
#   1. Pasó SHUTDOWN_NOT_BEFORE (si está definido).
#   2. No hay elecciones CONFIGURADA, ABIERTA ni CERRADA (pendiente de
#      escrutinio). Si la consulta a la base falla, no se apaga.
#   3. No hubo tráfico HTTPS durante IDLE_MINUTES (conexiones establecidas en
#      :443 o escrituras en el access log de nginx). El conteo arranca, como
#      mínimo, desde el último boot y desde que la última elección dejó de
#      estar pendiente.
#   4. El respaldo previo (BACKUP_BEFORE_SHUTDOWN=true) terminó bien.
#
# Uso manual: sudo /opt/votar/bin/idle-shutdown.sh   (DRY_RUN=true para probar)
set -euo pipefail

VPS_ENV_FILE="${VOTAR_VPS_ENV:-/etc/votar/vps.env}"
STATE_DIR="${VOTAR_IDLE_STATE_DIR:-/var/lib/votar-idle}"
BACK_DIR="${VOTAR_BACK_DIR:-/opt/votar/back}"
APP_USER="${VOTAR_APP_USER:-votar}"
ACCESS_LOG="${VOTAR_ACCESS_LOG:-/var/log/nginx/votar-access.log}"
HTTPS_PORT="${VOTAR_HTTPS_PORT:-443}"

if [[ -f "$VPS_ENV_FILE" ]]; then
  # shellcheck source=/dev/null
  . "$VPS_ENV_FILE"
fi

IDLE_MINUTES="${IDLE_MINUTES:-60}"
SHUTDOWN_NOT_BEFORE="${SHUTDOWN_NOT_BEFORE:-}"
BACKUP_BEFORE_SHUTDOWN="${BACKUP_BEFORE_SHUTDOWN:-true}"
SHUTDOWN_HOOK="${SHUTDOWN_HOOK:-}"
DRY_RUN="${DRY_RUN:-false}"

log() { echo "[votar-idle] $*"; }

if ! [[ "$IDLE_MINUTES" =~ ^[0-9]+$ ]] || (( IDLE_MINUTES < 5 )); then
  log "IDLE_MINUTES inválido ('$IDLE_MINUTES'; mínimo 5). No se apaga."
  exit 1
fi

# --- Sondas (se pueden reemplazar en pruebas vía VOTAR_IDLE_STUBS) ---

now_epoch() { date +%s; }

boot_epoch() {
  local uptime
  uptime=$(cut -d' ' -f1 /proc/uptime)
  echo $(( $(now_epoch) - ${uptime%.*} ))
}

# Cantidad de elecciones que todavía necesitan el servidor. Imprime un número
# o falla (=> no apagar).
pending_elections() {
  local db_name
  db_name=$(sed -n 's/^DB_NAME=//p' "$BACK_DIR/.env" | tail -1 | tr -d "\"'")
  runuser -u postgres -- psql -X -v ON_ERROR_STOP=1 -d "${db_name:-votar}" -tAc \
    "SELECT count(*) FROM eleccion
      WHERE fecha_eliminacion IS NULL
        AND estado IN ('CONFIGURADA', 'ABIERTA', 'CERRADA')"
}

# Conexiones HTTPS establecidas desde fuera del host.
active_https_connections() {
  ss -Htn state established "( sport = :$HTTPS_PORT )" \
    | awk '{print $4}' \
    | grep -v -E '^(127\.|\[::1\]|\[::ffff:127\.)' \
    | wc -l
}

access_log_mtime() {
  if [[ -f "$ACCESS_LOG" ]]; then stat -c %Y "$ACCESS_LOG"; else echo 0; fi
}

run_backup() {
  runuser -u "$APP_USER" -- bash -c "cd '$BACK_DIR' && npm run --silent db:backup"
}

power_off() { systemctl poweroff; }

if [[ -n "${VOTAR_IDLE_STUBS:-}" ]]; then
  # shellcheck source=/dev/null
  . "$VOTAR_IDLE_STUBS"
fi

# --- Decisión ---

mkdir -p "$STATE_DIR"
exec 9>"$STATE_DIR/lock"
if ! flock -n 9; then
  log "Otra ejecución en curso. Se omite."
  exit 0
fi

LAST_ACTIVITY_FILE="$STATE_DIR/last-activity"
now=$(now_epoch)

touch_activity() { echo "$1" >"$LAST_ACTIVITY_FILE"; }
max() { if (( $1 > $2 )); then echo "$1"; else echo "$2"; fi; }

if [[ -n "$SHUTDOWN_NOT_BEFORE" ]]; then
  if ! not_before=$(date -d "$SHUTDOWN_NOT_BEFORE" +%s 2>/dev/null); then
    log "SHUTDOWN_NOT_BEFORE inválido ('$SHUTDOWN_NOT_BEFORE'). No se apaga."
    exit 1
  fi
  if (( now < not_before )); then
    log "Antes de SHUTDOWN_NOT_BEFORE ($SHUTDOWN_NOT_BEFORE). No se apaga."
    exit 0
  fi
else
  not_before=0
fi

if ! pending=$(pending_elections 2>&1) || ! [[ "$pending" =~ ^[[:space:]]*[0-9]+[[:space:]]*$ ]]; then
  log "No se pudo consultar el estado de las elecciones ($pending). No se apaga."
  exit 1
fi
pending=$(echo "$pending" | tr -d '[:space:]')
if (( pending > 0 )); then
  touch_activity "$now"
  log "$pending elección(es) CONFIGURADA/ABIERTA/CERRADA. No se apaga."
  exit 0
fi

last_activity=0
if [[ -f "$LAST_ACTIVITY_FILE" ]]; then
  last_activity=$(<"$LAST_ACTIVITY_FILE")
  [[ "$last_activity" =~ ^[0-9]+$ ]] || last_activity=0
fi
last_activity=$(max "$last_activity" "$(access_log_mtime)")

connections=$(active_https_connections | tr -d '[:space:]')
if (( connections > 0 )); then
  last_activity=$now
fi
touch_activity "$last_activity"

idle_since=$(max "$(max "$last_activity" "$(boot_epoch)")" "$not_before")
idle_seconds=$(( now - idle_since ))
threshold=$(( IDLE_MINUTES * 60 ))

if (( idle_seconds < threshold )); then
  log "Inactivo hace $(( idle_seconds / 60 )) min (umbral $IDLE_MINUTES min, conexiones activas: $connections). No se apaga."
  exit 0
fi

log "Sin elecciones pendientes y sin tráfico hace $(( idle_seconds / 60 )) min."

if [[ "$DRY_RUN" == "true" ]]; then
  log "DRY_RUN=true: se respaldaría la base y se apagaría la instancia."
  exit 0
fi

if [[ "$BACKUP_BEFORE_SHUTDOWN" == "true" ]]; then
  log "Generando respaldo cifrado previo al apagado..."
  if ! run_backup; then
    log "El respaldo falló. No se apaga (revisar el mail de alerta de VOTAR-388)."
    exit 1
  fi
  log "Respaldo OK."
fi

if [[ -n "$SHUTDOWN_HOOK" ]]; then
  log "Ejecutando SHUTDOWN_HOOK..."
  if ! sh -c "$SHUTDOWN_HOOK"; then
    log "SHUTDOWN_HOOK falló; se continúa con el apagado del SO."
  fi
fi

log "Apagando la instancia."
power_off
