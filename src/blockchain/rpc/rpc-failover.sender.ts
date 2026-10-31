import {
  RPC_FAILOVER_TIMEOUT_MS,
  RPC_MAX_BLOCK_SKEW,
  RPC_RETRY_MAX_DELAY_MS,
} from './rpc-failover.constants';
import {
  classifyRpcFailoverReason,
  describeRpcEndpoint,
  formatRpcFailoverLog,
  isBlockSkewAcceptable,
  isRpcFailoverError,
  sanitizeRpcUrl,
  type RpcFailoverEvent,
} from './rpc-failover.util';

export type JsonRpcRequestBody = unknown;

export type JsonRpcHttpResult = {
  status: number;
  json: unknown;
};

export type RpcJsonSender = (
  url: string,
  body: JsonRpcRequestBody,
  timeoutMs: number,
) => Promise<JsonRpcHttpResult>;

export type RpcBlockNumberReader = (url: string) => Promise<number>;

export type RpcFailoverLogger = {
  warn(message: string, ...optionalParams: unknown[]): void;
};

export class RpcHttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'RpcHttpError';
    this.status = status;
  }
}

export type RpcRetryOptions = {
  /** Reintentos adicionales tras agotar la rotación completa de endpoints. */
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
};

export type SendJsonRpcWithFailoverOptions = {
  retry?: RpcRetryOptions;
  timeoutMs?: number;
  maxBlockSkew?: number;
  lastKnownBlock?: number | null;
  /** Persists the reference block height for later failovers on the same provider. */
  onReferenceBlock?: (block: number) => void;
  logger?: RpcFailoverLogger;
  now?: () => string;
  send: RpcJsonSender;
  readBlockNumber?: RpcBlockNumberReader;
};

const jsonRpcRateLimited = (json: unknown): boolean => {
  const items = Array.isArray(json) ? json : [json];
  return items.some((item) => {
    if (!item || typeof item !== 'object' || !('error' in item)) {
      return false;
    }
    const error = (item as { error?: { code?: unknown; message?: unknown } })
      .error;
    const code =
      typeof error?.code === 'string' || typeof error?.code === 'number'
        ? String(error.code)
        : '';
    const message = typeof error?.message === 'string' ? error.message : '';
    return (
      code === '-32005' ||
      code === '429' ||
      /rate limit|too many requests|429/i.test(message)
    );
  });
};

const sendOnce = async (
  urls: readonly string[],
  body: JsonRpcRequestBody,
  options: SendJsonRpcWithFailoverOptions,
): Promise<unknown> => {
  if (urls.length === 0) {
    throw new Error('No RPC URLs configured for failover');
  }

  const timeoutMs = options.timeoutMs ?? RPC_FAILOVER_TIMEOUT_MS;
  const maxBlockSkew = options.maxBlockSkew ?? RPC_MAX_BLOCK_SKEW;
  const now = options.now ?? (() => new Date().toISOString());
  let lastError: unknown;
  let referenceBlock = options.lastKnownBlock ?? null;

  const rememberReferenceBlock = (block: number): void => {
    referenceBlock = block;
    options.onReferenceBlock?.(block);
  };

  const resolveReferenceBlock = async (): Promise<number | null> => {
    if (referenceBlock != null) {
      return referenceBlock;
    }
    if (!options.readBlockNumber) {
      return null;
    }
    try {
      const block = await options.readBlockNumber(urls[0]);
      rememberReferenceBlock(block);
      return block;
    } catch {
      return null;
    }
  };

  for (let index = 0; index < urls.length; index += 1) {
    const url = urls[index];
    const backupUrl = urls[index + 1];

    try {
      if (index > 0 && options.readBlockNumber) {
        const refBlock = await resolveReferenceBlock();
        if (refBlock != null) {
          const backupBlock = await options.readBlockNumber(url);
          const skew = Math.abs(refBlock - backupBlock);
          if (!isBlockSkewAcceptable(refBlock, backupBlock, maxBlockSkew)) {
            lastError = new Error(
              `RPC block skew ${skew} exceeds max ${maxBlockSkew} on ${describeRpcEndpoint(url)}`,
            );
            options.logger?.warn(
              formatRpcFailoverLog({
                at: now(),
                reason: 'unavailable',
                failedEndpoint: sanitizeRpcUrl(url),
                backupEndpoint: backupUrl
                  ? sanitizeRpcUrl(backupUrl)
                  : '(none)',
                message: `skipped backup: block skew ${skew} (ref=${refBlock}, backup=${backupBlock})`,
                blockSkew: skew,
              }),
            );
            continue;
          }
        }
      }

      const response = await options.send(url, body, timeoutMs);
      if (response.status === 429 || jsonRpcRateLimited(response.json)) {
        throw new RpcHttpError(429, 'Too Many Requests');
      }
      if (response.status === 401 || response.status === 403) {
        throw new RpcHttpError(response.status, 'RPC authentication failed');
      }
      if (response.status >= 500) {
        throw new RpcHttpError(response.status, `RPC HTTP ${response.status}`);
      }
      if (response.status < 200 || response.status >= 300) {
        throw new RpcHttpError(response.status, `RPC HTTP ${response.status}`);
      }
      return response.json;
    } catch (error) {
      lastError = error;
      if (!backupUrl || !isRpcFailoverError(error)) {
        throw error;
      }

      if (referenceBlock == null && options.readBlockNumber) {
        try {
          rememberReferenceBlock(await options.readBlockNumber(url));
        } catch {
          // Primary may be fully unavailable; skew check best-effort on next hop.
        }
      }

      const event: RpcFailoverEvent = {
        at: now(),
        reason: classifyRpcFailoverReason(error) ?? 'network',
        failedEndpoint: sanitizeRpcUrl(url),
        backupEndpoint: sanitizeRpcUrl(backupUrl),
        message: error instanceof Error ? error.message : String(error),
      };
      options.logger?.warn(formatRpcFailoverLog(event));
    }
  }

  throw lastError;
};

/** Backoff exponencial con jitter parcial: entre 50% y 100% del tramo. */
export const computeRetryDelayMs = (
  attempt: number,
  retry: RpcRetryOptions,
): number => {
  const cap = retry.maxDelayMs ?? RPC_RETRY_MAX_DELAY_MS;
  const exponential = Math.min(cap, retry.baseDelayMs * 2 ** attempt);
  const random = retry.random ?? Math.random;
  return Math.round(exponential / 2 + (random() * exponential) / 2);
};

/**
 * Failover primario → respaldos (< 1s por salto) y, si TODOS los endpoints
 * fallan por causas transitorias (timeout, 429, 5xx, red), reintenta la
 * rotación completa con backoff exponencial. Los errores de autenticación
 * (401/403) no se reintentan: no son transitorios.
 */
export const sendJsonRpcWithFailover = async (
  urls: readonly string[],
  body: JsonRpcRequestBody,
  options: SendJsonRpcWithFailoverOptions,
): Promise<unknown> => {
  const retry = options.retry;
  if (!retry || retry.maxRetries <= 0) {
    return sendOnce(urls, body, options);
  }

  const sleep =
    retry.sleep ??
    ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  let lastKnownBlock = options.lastKnownBlock ?? null;

  for (let attempt = 0; ; attempt += 1) {
    try {
      return await sendOnce(urls, body, {
        ...options,
        lastKnownBlock,
        onReferenceBlock: (block) => {
          lastKnownBlock = block;
          options.onReferenceBlock?.(block);
        },
      });
    } catch (error) {
      const reason = classifyRpcFailoverReason(error);
      if (attempt >= retry.maxRetries || reason == null || reason === 'auth') {
        throw error;
      }
      const delayMs = computeRetryDelayMs(attempt, retry);
      options.logger?.warn(
        `retry ${attempt + 1}/${retry.maxRetries} in ${delayMs}ms reason=${reason}`,
      );
      await sleep(delayMs);
    }
  }
};
