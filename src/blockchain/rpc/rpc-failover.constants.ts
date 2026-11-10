/** VOTAR-386 — switch to a backup RPC in under 1 second. */
export const RPC_FAILOVER_TIMEOUT_MS = 800;

/** Maximum allowed block height gap between providers during a switch. */
export const RPC_MAX_BLOCK_SKEW = 5;

export const RPC_FAILOVER_LOG_PREFIX = '[VOTAR rpc-failover]';
