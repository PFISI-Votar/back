#!/bin/sh
# VOTAR-498 — genera una CA y un certificado de servidor self-signed para
# levantar PostgreSQL con TLS en desarrollo (docker-compose.db-tls.yml).
#
# NO usar en producción: ahí el certificado del servidor debe emitirlo la CA
# institucional (ver README.md de esta carpeta).
#
# Uso: sh deploy/postgres/generate-dev-certs.sh   (o: npm run db:certs)
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
CERTS_DIR="$SCRIPT_DIR/certs"
DAYS=825 # límite práctico de validez aceptado por la mayoría de los navegadores/clientes TLS

mkdir -p "$CERTS_DIR"
cd "$CERTS_DIR"

if [ -f ca.crt ] && [ -f server.crt ] && [ -f server.key ]; then
  echo "Ya existen certificados en $CERTS_DIR. Borrarlos manualmente para regenerar."
  exit 0
fi

echo "Generando CA de desarrollo..."
openssl genrsa -out ca.key 4096
openssl req -x509 -new -nodes -key ca.key -sha256 -days "$DAYS" \
  -subj "/O=VOTAR Dev/CN=VOTAR Dev CA" \
  -out ca.crt

echo "Generando certificado de servidor (SAN: db, localhost, 127.0.0.1)..."
openssl genrsa -out server.key 2048
openssl req -new -key server.key \
  -subj "/O=VOTAR Dev/CN=votar-db-dev" \
  -out server.csr

cat > server.ext <<'EOF'
subjectAltName = DNS:db,DNS:localhost,IP:127.0.0.1
extendedKeyUsage = serverAuth
EOF

openssl x509 -req -in server.csr -CA ca.crt -CAkey ca.key -CAcreateserial \
  -days "$DAYS" -sha256 -extfile server.ext \
  -out server.crt

rm -f server.csr server.ext ca.srl

# PostgreSQL exige que la clave privada del servidor no sea legible por
# otros (falla el arranque si el modo de archivo es más permisivo).
chmod 600 server.key ca.key
chmod 644 server.crt ca.crt

echo "Certificados generados en $CERTS_DIR (ca.crt, server.crt, server.key)."
echo "Configurar en .env: DB_SSL_MODE=verify-ca, DB_SSL_CA=$CERTS_DIR/ca.crt"
