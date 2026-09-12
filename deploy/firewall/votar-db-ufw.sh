#!/bin/sh
# VOTAR-498 — alternativa a votar-db.nft para hosts que administran su
# firewall con ufw en vez de nftables directo. Mismo efecto: solo el backend
# puede llegar al puerto de PostgreSQL.
#
# Reemplazar BACKEND_IP por la IP/CIDR real del host del backend antes de
# ejecutar. Requiere privilegios de root.
set -eu

BACKEND_IP="<BACKEND_IP>"
DB_PORT=5432

ufw deny "$DB_PORT"/tcp
ufw allow from "$BACKEND_IP" to any port "$DB_PORT" proto tcp

echo "Regla aplicada: solo $BACKEND_IP puede llegar al puerto $DB_PORT/tcp."
echo "Verificar con: ufw status numbered"
