#!/bin/bash

# Script para vaciar la base de datos y ejecutar seeders
# Uso: ./scripts/reset-db.sh

set -e

echo "🔄 Reiniciando blockchain local..."
docker compose restart blockchain
echo "⏳ Esperando que blockchain esté listo..."
sleep 5
echo "✅ Blockchain reiniciado"
echo ""

echo "🗑️  Vaciando tablas de la base de datos..."

docker compose exec -T postgres psql -U postgres -d votar -c "
TRUNCATE TABLE
  voto_confirmacion,
  merkle_tree,
  padron_votante,
  padron_electoral,
  campo_datos_candidato,
  candidato,
  lista,
  categoria,
  configuracion_datos_candidato,
  boleta,
  configuracion_comicio,
  audit_log,
  eleccion
CASCADE;
" > /dev/null

echo "✅ Tablas vaciadas correctamente"
echo ""
echo "🌱 Ejecutando seeders..."
echo ""

npm run seed

echo ""
echo "✅ Base de datos reseteada correctamente"
echo ""
echo "📊 Elecciones creadas:"

docker compose exec -T postgres psql -U postgres -d votar -c "
SELECT
  id_eleccion as ID,
  nombre as \"Nombre\",
  estado as \"Estado\",
  TO_CHAR(fecha_inicio, 'YYYY-MM-DD HH24:MI') as \"Fecha Inicio\"
FROM eleccion
ORDER BY id_eleccion;
"
