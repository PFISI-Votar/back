import {
  RPC_FAILOVER_TIMEOUT_MS,
  RPC_MAX_BLOCK_SKEW,
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

export type SendJsonRpcWithFailoverOptions = {
  timeoutMs?: number;
  maxBlockSkew?: number;
  lastKnownBlock?: number | null;
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

export const sendJsonRpcWithFailover = async (
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

  for (let index = 0; index < urls.length; index += 1) {
    const url = urls[index];
    const backupUrl = urls[index + 1];

    try {
      if (
        index > 0 &&
        options.readBlockNumber &&
        options.lastKnownBlock != null
      ) {
        const backupBlock = await options.readBlockNumber(url);
        const skew = Math.abs(options.lastKnownBlock - backupBlock);
        if (
          !isBlockSkewAcceptable(
            options.lastKnownBlock,
            backupBlock,
            maxBlockSkew,
          )
        ) {
          lastError = new Error(
            `RPC block skew ${skew} exceeds max ${maxBlockSkew} on ${describeRpcEndpoint(url)}`,
          );
          options.logger?.warn(
            formatRpcFailoverLog({
              at: now(),
              reason: 'unavailable',
              failedEndpoint: sanitizeRpcUrl(url),
              backupEndpoint: backupUrl ? sanitizeRpcUrl(backupUrl) : '(none)',
              message: `skipped backup: block skew ${skew} (ref=${options.lastKnownBlock}, backup=${backupBlock})`,
              blockSkew: skew,
            }),
          );
          continue;
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
