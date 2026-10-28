import type { JsonRpcPayload } from 'ethers';
import {
  RPC_CACHE_FINALITY_DEPTH,
  RPC_CACHE_LATEST_TTL_MS,
  RPC_CACHE_MAX_ENTRIES,
} from './rpc-failover.constants';

export type RpcCacheOptions = {
  latestTtlMs?: number;
  maxEntries?: number;
  /** Bloques de distancia al head para considerar un bloque finalizado. */
  finalityDepth?: number;
  now?: () => number;
};

export type RpcItem =
  { id: number; result: unknown } | { id: number; error: unknown };

type Entry = { result: unknown; expiresAt: number };

const IMMUTABLE = Number.POSITIVE_INFINITY;
const HEX_BLOCK = /^0x[0-9a-f]+$/i;

const isHexBlock = (value: unknown): boolean =>
  typeof value === 'string' && HEX_BLOCK.test(value);

const toBlockNumber = (value: unknown): number | null =>
  isHexBlock(value) ? Number.parseInt(value as string, 16) : null;

/**
 * Bloque al que queda atada la respuesta (null = no depende de un bloque).
 * Las consultas por hash/receipt solo lo revelan en el resultado.
 */
const pinnedBlock = (
  payload: JsonRpcPayload,
  result: unknown,
): number | null => {
  const params = Array.isArray(payload.params) ? payload.params : [];
  const fromResult = (field: string): number | null =>
    toBlockNumber((result as Record<string, unknown> | null)?.[field]);
  switch (payload.method) {
    case 'eth_getBlockByNumber':
      return toBlockNumber(params[0]);
    case 'eth_getBlockByHash':
      return fromResult('number');
    case 'eth_getTransactionReceipt':
      return fromResult('blockNumber');
    case 'eth_call':
      return toBlockNumber(params[1]);
    case 'eth_getLogs':
      return toBlockNumber(
        ((params[0] ?? {}) as Record<string, unknown>).toBlock,
      );
    default:
      return null;
  }
};

/**
 * VOTAR-515 — TTL máximo por método. `null` = no cacheable (escrituras, estado
 * pendiente, lecturas "latest" sensibles a un voto recién emitido).
 * `IMMUTABLE` es solo un techo: una respuesta atada a un bloque recién minado
 * puede cambiar en una reorganización, así que el caché solo la guarda sin
 * vencimiento cuando el bloque está detrás de la profundidad de finalidad.
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
  readonly #finalityDepth: number;
  #head: number | null = null;

  constructor(options: RpcCacheOptions = {}) {
    this.#latestTtlMs = options.latestTtlMs ?? RPC_CACHE_LATEST_TTL_MS;
    this.#maxEntries = options.maxEntries ?? RPC_CACHE_MAX_ENTRIES;
    this.#now = options.now ?? Date.now;
    this.#finalityDepth = options.finalityDepth ?? RPC_CACHE_FINALITY_DEPTH;
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
      this.#observeHead(payload, hit.result);
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
      this.#observeHead(payload, response.result);
      this.#store(
        key,
        response.result,
        this.#effectiveTtl(payload, response.result, ttl),
      );
    }
    return 'result' in response
      ? { id: payload.id, result: response.result }
      : { id: payload.id, error: response.error };
  }

  /** Último head conocido; se sobrescribe (no `max`) para seguir un reorg. */
  #observeHead(payload: JsonRpcPayload, result: unknown): void {
    if (payload.method === 'eth_blockNumber') {
      this.#head = toBlockNumber(result) ?? this.#head;
    }
  }

  #effectiveTtl(payload: JsonRpcPayload, result: unknown, ttl: number): number {
    if (ttl !== IMMUTABLE) return ttl;
    const block = pinnedBlock(payload, result);
    if (block === null) return IMMUTABLE;
    const finalized =
      this.#head !== null && block <= this.#head - this.#finalityDepth;
    return finalized ? IMMUTABLE : this.#latestTtlMs;
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
