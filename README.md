# VOTAR — Backend (NestJS)

API off-chain del proyecto **VOTAR** (UTN FRVM, Equipo 09): autenticación de autoridad electoral, padrón, cómputo Merkle, publicación on-chain y login de votante.

- Swagger: `http://localhost:3000/api/docs`

## Requisitos

- Node.js 24+
- PostgreSQL 16 local en ejecución
- Repo [`blockchain`](../blockchain) clonado como hermano de `back/` (para publicación Merkle on-chain)
- Credenciales UTN (Autogestión) para registrar tu usuario como administrador

## Setup inicial

```bash
cd back
npm install
cp .env.example .env
```

Completá en `.env` tus credenciales de DB local y admin UTN:

```env
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=postgres
DB_NAME=votar
DEV_ADMIN_NICK=tuLegajo
DEV_ADMIN_PASSWORD=tuPasswordUTN
JWT_SECRET=dev-secret-min-16-chars
```

No hace falta configurar variables de blockchain en local: el repo `blockchain/` las genera en `.env.blockchain.local` (gitignored).

## Desarrollo local

### 1. Blockchain (terminal 1)

```bash
cd ../blockchain
npm install
npm run dev
```

Levanta Hardhat node, despliega contratos, asigna roles y escribe `back/.env.blockchain.local` automáticamente.

### 2. API (terminal 2)

```bash
cd back
npm run dev
```

Esto ejecuta:

1. Espera a PostgreSQL local
2. Migraciones TypeORM
3. Registro de tu usuario como `ELECTION_ADMIN` vía Autogestión (solo si no hay admins en la DB y configuraste `DEV_ADMIN_*`)
4. API NestJS en modo watch (`http://localhost:3000`)

### 3. Frontend (terminal 3)

```bash
cd ../front
npm install
cp .env.example .env
npm run dev
```

Panel de gestión: `http://localhost:5173` — login con el mismo nick/password UTN del `.env`.

### Variables de entorno de desarrollo

| Variable | Descripción |
|----------|-------------|
| `DEV_ADMIN_NICK` | Usuario UTN para registrarte como admin al bootstrap |
| `DEV_ADMIN_PASSWORD` | Contraseña UTN |
| `DEV_SEED_DEMO=true` | Carga elecciones demo tras migrar |

### Comandos útiles

```bash
npm run dev:bootstrap   # Solo migrate + admin (sin API)
npm run dev:api         # Solo NestJS watch (asume infra ya lista)
npm run admin:register  # Registrar admin manualmente (interactivo)
```

### Verificación E2E blockchain (local)

Con Hardhat (`npm run dev` en `blockchain/`) y la API en marcha (`npm run dev` en `back/`), podés validar el flujo completo de publicación Merkle on-chain:

```bash
node scripts/test-blockchain-flow.mjs
```

El script es autocontenido: crea un comicio, importa un padrón CSV de prueba embebido, publica el Merkle root y verifica `isPublished` / `getMerkleRoot` en el contrato local. Requiere `DEV_ADMIN_NICK` y `DEV_ADMIN_PASSWORD` en `.env` (y `.env.blockchain.local` generado por el repo blockchain). Debe terminar con código de salida 0.

## Tests

```bash
npm run test
npm run test:e2e
npm run lint
```

## Producción / Sepolia

Para testnet, configurá manualmente en `.env` las variables `SEPOLIA_RPC_URL`, `MERKLE_ROOT_STORE_ADDRESS` y `MERKLE_UPDATER_PRIVATE_KEY`. Ver `docs/US-335-sepolia-uat.md`.
