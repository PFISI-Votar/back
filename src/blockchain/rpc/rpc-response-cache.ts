import type { JsonRpcPayload } from 'ethers';
import {
  RPC_CACHE_LATEST_TTL_MS,
  RPC_CACHE_MAX_ENTRIES,
} from './rpc-failover.constants';

export type RpcCacheOptions = {
  latestTtlMs?: number;
  maxEntries?: number;
  now?: () => number;
};

export type RpcItem =
  { id: number; result: unknown } | { id: number; error: unknown };

type Entry = { result: unknown; expiresAt: number };

const IMMUTABLE = Number.POSITIVE_INFINITY;
const HEX_BLOCK = /^0x[0-9a-f]+$/i;

const isHexBlock = (value: unknown): boolean =>
  typeof value === 'string' && HEX_BLOCK.test(value);

/**
 * VOTAR-515 — TTL por método. `null` = no cacheable (escrituras, estado
 * pendiente, lecturas "latest" sensibles a un voto recién emitido).
 * Solo se cachea lo inmutable (bloque fijo / receipt minado) o lo que cambia
 * con cada bloque y tolera unos segundos de atraso (`eth_blockNumber`).
 */
export const rpcCacheTtlMs = (
  payload: JsonRpcPayload,
  latestTtlMs: number,
): number | null => {
  const params = Array.isArray(payload.params) ? payload.params : [];
  switch (payload.method) {
    case 'eth_chainId':
    case 'net_version':
      return IMMUTABLE;
    case 'eth_blockNumber':
      return latestTtlMs;
    case 'eth_getBlockByNumber':
      if (isHexBlock(params[0])) return IMMUTABLE;
      return params[0] === 'latest' ? latestTtlMs : null;
    case 'eth_getBlockByHash':
    case 'eth_getTransactionReceipt':
      return IMMUTABLE;
    case 'eth_call':
      return isHexBlock(params[1]) ? IMMUTABLE : null;
    case 'eth_getLogs': {
      const filter = (params[0] ?? {}) as Record<string, unknown>;
      return isHexBlock(filter.fromBlock) && isHexBlock(filter.toBlock)
        ? IMMUTABLE
        : null;
    }
    default:
      return null;
  }
};

/**
 * Caché local de respuestas JSON-RPC con coalescencia de requests idénticas
 * en vuelo. Solo guarda resultados no nulos y exitosos; reescribe el `id` de
 * JSON-RPC para cada consumidor.
 */
export class RpcResponseCache {
  readonly #entries = new Map<string, Entry>();
  readonly #inflight = new Map<string, Promise<unknown>>();
  readonly #latestTtlMs: number;
  readonly #maxEntries: number;
  readonly #now: () => number;

  constructor(options: RpcCacheOptions = {}) {
    this.#latestTtlMs = options.latestTtlMs ?? RPC_CACHE_LATEST_TTL_MS;
    this.#maxEntries = options.maxEntries ?? RPC_CACHE_MAX_ENTRIES;
    this.#now = options.now ?? Date.now;
  }

  get size(): number {
    return this.#entries.size;
  }

  async resolve(
    payload: JsonRpcPayload,
    load: () => Promise<RpcItem>,
  ): Promise<RpcItem> {
    const ttl = rpcCacheTtlMs(payload, this.#latestTtlMs);
    if (ttl == null) {
      return load();
    }

    const key = JSON.stringify([payload.method, payload.params]);
    const hit = this.#entries.get(key);
    if (hit && hit.expiresAt > this.#now()) {
      return { id: payload.id, result: hit.result };
    }
    this.#entries.delete(key);

    let pending = this.#inflight.get(key) as Promise<RpcItem> | undefined;
    if (!pending) {
      pending = load().finally(() => this.#inflight.delete(key));
      this.#inflight.set(key, pending);
    }

    const response = await pending;
    if (
      'result' in response &&
      response.result !== null &&
      response.result !== undefined
    ) {
      this.#store(key, response.result, ttl);
    }
    return 'result' in response
      ? { id: payload.id, result: response.result }
      : { id: payload.id, error: response.error };
  }

  #store(key: string, result: unknown, ttl: number): void {
    if (this.#entries.size >= this.#maxEntries) {
      const [oldest] = this.#entries.keys();
      this.#entries.delete(oldest);
    }
    this.#entries.set(key, {
      result,
      expiresAt: ttl === IMMUTABLE ? IMMUTABLE : this.#now() + ttl,
    });
  }
}
