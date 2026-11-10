/** VOTAR-386 — switch to a backup RPC in under 1 second. */
export const RPC_FAILOVER_TIMEOUT_MS = 800;

/** Maximum allowed block height gap between providers during a switch. */
export const RPC_MAX_BLOCK_SKEW = 5;

export const RPC_FAILOVER_LOG_PREFIX = '[VOTAR rpc-failover]';

/** VOTAR-515 — reintentos tras agotar la rotación primario → respaldos. */
export const RPC_RETRY_MAX_RETRIES = 3;

/** VOTAR-515 — base del backoff exponencial (250ms, 500ms, 1s, …). */
export const RPC_RETRY_BASE_DELAY_MS = 250;

/** VOTAR-515 — tope del backoff para no bloquear una request indefinidamente. */
export const RPC_RETRY_MAX_DELAY_MS = 4000;

/** VOTAR-515 — TTL de lecturas que cambian con cada bloque (Sepolia ≈ 12s). */
export const RPC_CACHE_LATEST_TTL_MS = 2000;

/** VOTAR-515 — tope de entradas del caché local (descarta las más viejas). */
export const RPC_CACHE_MAX_ENTRIES = 500;

/**
 * VOTAR-515 — profundidad (en bloques) bajo el head desde la cual una
 * respuesta atada a un bloque se considera finalizada y se cachea sin
 * vencimiento (Sepolia: 2 épocas × 32 slots).
 */
export const RPC_CACHE_FINALITY_DEPTH = 64;
