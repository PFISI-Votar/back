#!/bin/bash

# Prueba reproducible (sin Docker real) de que cleanup-dev-env.sh nunca lista
# para borrar los volúmenes votar-*, con o sin el prefijo de Compose.
# Uso: ./scripts/test-cleanup-dev-env.sh

set -euo pipefail

DIR=$(cd "$(dirname "$0")" && pwd)
STUB=$(mktemp -d)
trap 'rm -rf "$STUB"' EXIT

cat > "$STUB/docker" << 'STUB_EOF'
#!/bin/bash
case "$1 $2" in
  "info "*) exit 0 ;;
  "volume ls")
    echo "codigo_votar-pg-data-dev|votar-pg-data-dev"
    echo "votar-pg-data-dev|"
    echo "codigo_otro-volumen|otro-volumen"
    ;;
esac
STUB_EOF
chmod +x "$STUB/docker"

OUT=$(PATH="$STUB:$PATH" "$DIR/cleanup-dev-env.sh" --skip-git)

if echo "$OUT" | grep -q 'votar-pg-data-dev'; then
  echo "❌ El volumen votar-pg-data-dev quedó incluido en la purga" >&2
  exit 1
fi
if ! echo "$OUT" | grep -q 'codigo_otro-volumen'; then
  echo "❌ Un volumen en desuso no protegido no fue listado" >&2
  exit 1
fi
echo "✅ Volúmenes votar-* protegidos (con y sin prefijo de Compose)"
