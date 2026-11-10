# VOTAR-520 — Stress-test de votación con N usuarios

Script: `scripts/stress-votacion.mjs` (`npm run stress:votacion -- <subcomando> …`).

Simula el sufragio completo de un padrón ficticio (por defecto 1000 votantes) con las llegadas repartidas en una ventana configurable (30 min, 1 h, 2 h…, o ráfaga con `--duration-min 0`) y verifica que todos los votos queden registrados.

## Flujo simulado por votante

`login SSO → boleta-digital → merkle-proof → credencial (commit) → autorización del relayer → [anónimo] firma de validación → [anónimo] relayer/cast`

Cada votante genera su billetera efímera, su nullifier (`keccak256(clavePública:idEleccion)`), el `selectionHash` y la firma EIP-712 `Vote` (dominio `VOTAR` v2), igual que el front. Las dos últimas fases salen sin cookie, como en el cliente real.

## Preparación

1. Generar el padrón ficticio e importarlo como admin en un comicio nuevo (publicar Merkle y abrir el comicio):
   ```bash
   npm run stress:votacion -- csv --voters 1000 --out padron-stress.csv
   ```
2. Levantar una Autogestión falsa (el SSO real no puede autenticar 1000 usuarios sintéticos) y arrancar el backend apuntando a ella:
   ```bash
   npm run stress:votacion -- mock --port 4010
   AUTOGESTION_BASE_URL=http://localhost:4010 npm run dev:api
   ```
3. Todas las requests salen de una misma IP: subir o desactivar los rate limits del backend **solo en el ambiente de prueba**; de lo contrario se medirá el rate limit y no el sistema.

## Ejecución

```bash
npm run stress:votacion -- run --eleccion 12 --voters 1000 --duration-min 30 \
  --chain-id 11155111 --rpc $SEPOLIA_RPC_URL --report stress-report.json
```

| Opción           | Default                  | Descripción                                                 |
| ---------------- | ------------------------ | ----------------------------------------------------------- |
| `--base`         | `http://localhost:$PORT` | URL de la API                                               |
| `--eleccion`     | —                        | idEleccion (requerido)                                      |
| `--voters`       | 1000                     | Cantidad de votantes (debe coincidir con el CSV)            |
| `--duration-min` | 0                        | Ventana de llegada en minutos; 0 = ráfaga                   |
| `--max-inflight` | 200                      | Tope de votantes concurrentes                               |
| `--chain-id`     | 11155111                 | chainId del dominio EIP-712                                 |
| `--rpc`          | —                        | Si se indica, verifica el receipt (`status=1`) de cada voto |
| `--seed`         | 520                      | Semilla del reparto de llegadas (reproducible)              |
| `--report`       | —                        | Archivo JSON con el reporte                                 |

## Reporte y criterio de éxito

Imprime throughput, votos aceptados/fallidos, fallos por paso y status HTTP, y latencias p50/p95/p99/máx del voto completo y de cada paso. Sale con código 0 solo si **todos** los votos se aceptaron, no hay `txHash` ni nullifier duplicados y, con `--rpc`, todos los receipts están confirmados.

Los votantes sintéticos usan DNI `90000000 + n` y mails `stressNNNNN@stress.votar.test`; usar siempre un comicio de prueba, nunca uno real.
