import {
  JsonRpcApiProvider,
  Network,
  type JsonRpcError,
  type JsonRpcPayload,
  type JsonRpcResult,
} from 'ethers';
import {
  RPC_FAILOVER_LOG_PREFIX,
  RPC_FAILOVER_TIMEOUT_MS,
  RPC_MAX_BLOCK_SKEW,
} from './rpc-failover.constants';
import { RpcHttpError, sendJsonRpcWithFailover } from './rpc-failover.sender';
import type { RpcFailoverLogger } from './rpc-failover.sender';

export type FailoverFetch = (
  input: string,
  init: RequestInit,
) => Promise<Response>;

export type FailoverJsonRpcProviderOptions = {
  chainId: number;
  timeoutMs?: number;
  maxBlockSkew?: number;
  logger?: RpcFailoverLogger;
  fetchImpl?: FailoverFetch;
};

const defaultLogger: RpcFailoverLogger = {
  warn(message: string, ...optionalParams: unknown[]) {
    // Nest Logger is preferred; this fallback keeps scripts usable.
    console.warn(RPC_FAILOVER_LOG_PREFIX, message, ...optionalParams);
  },
};

const hexToNumber = (value: unknown): number => {
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'string') {
    return Number.parseInt(value, value.startsWith('0x') ? 16 : 10);
  }
  return Number.NaN;
};

export class FailoverJsonRpcProvider extends JsonRpcApiProvider {
  readonly #urls: readonly string[];
  readonly #timeoutMs: number;
  readonly #maxBlockSkew: number;
  readonly #logger: RpcFailoverLogger;
  readonly #fetchImpl: FailoverFetch;
  #lastKnownBlock: number | null = null;

  constructor(
    urls: readonly string[],
    options: FailoverJsonRpcProviderOptions,
  ) {
    if (urls.length === 0) {
      throw new Error('FailoverJsonRpcProvider requires at least one RPC URL');
    }
    const network = Network.from(options.chainId);
    super(network, {
      staticNetwork: network,
      batchMaxCount: 1,
    });
    this.#urls = urls;
    this.#timeoutMs = options.timeoutMs ?? RPC_FAILOVER_TIMEOUT_MS;
    this.#maxBlockSkew = options.maxBlockSkew ?? RPC_MAX_BLOCK_SKEW;
    this.#logger = options.logger ?? defaultLogger;
    this.#fetchImpl = options.fetchImpl ?? fetch;
    this._start();
  }

  async _send(
    payload: JsonRpcPayload | JsonRpcPayload[],
  ): Promise<Array<JsonRpcResult | JsonRpcError>> {
    const json = await sendJsonRpcWithFailover(this.#urls, payload, {
      timeoutMs: this.#timeoutMs,
      maxBlockSkew: this.#maxBlockSkew,
      lastKnownBlock: this.#lastKnownBlock,
      logger: this.#logger,
      send: (url, body, timeoutMs) => this.#post(url, body, timeoutMs),
      readBlockNumber: (url) => this.#ethBlockNumber(url),
    });

    const results = Array.isArray(json) ? json : [json];
    this.#rememberBlock(payload, results);
    return results as Array<JsonRpcResult | JsonRpcError>;
  }

  async #post(
    url: string,
    body: unknown,
    timeoutMs: number,
  ): Promise<{ status: number; json: unknown }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await this.#fetchImpl(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      let json: unknown = null;
      try {
        json = await response.json();
      } catch {
        json = null;
      }
      return { status: response.status, json };
    } catch (error) {
      if (controller.signal.aborted) {
        throw new RpcHttpError(408, `RPC timeout after ${timeoutMs}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  async #ethBlockNumber(url: string): Promise<number> {
    const response = await this.#post(
      url,
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_blockNumber',
        params: [],
      },
      this.#timeoutMs,
    );
    if (
      response.status !== 200 ||
      !response.json ||
      typeof response.json !== 'object'
    ) {
      throw new RpcHttpError(response.status, 'eth_blockNumber failed');
    }
    const result = (response.json as { result?: unknown }).result;
    const blockNumber = hexToNumber(result);
    if (!Number.isFinite(blockNumber)) {
      throw new Error('eth_blockNumber returned an invalid height');
    }
    return blockNumber;
  }

  #rememberBlock(
    payload: JsonRpcPayload | JsonRpcPayload[],
    results: unknown[],
  ): void {
    const requests = Array.isArray(payload) ? payload : [payload];
    requests.forEach((request, index) => {
      if (request.method !== 'eth_blockNumber') {
        return;
      }
      const item = results[index];
      if (!item || typeof item !== 'object' || !('result' in item)) {
        return;
      }
      const blockNumber = hexToNumber((item as { result?: unknown }).result);
      if (Number.isFinite(blockNumber)) {
        this.#lastKnownBlock = blockNumber;
      }
    });
  }
}
