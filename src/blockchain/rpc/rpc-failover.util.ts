export type RpcFailoverReason =
  | 'timeout'
  | 'rate_limit'
  | 'auth'
  | 'unavailable'
  | 'network';

export type RpcFailoverEvent = {
  at: string;
  reason: RpcFailoverReason;
  failedEndpoint: string;
  backupEndpoint: string;
  message: string;
  blockSkew?: number;
};

const RATE_LIMIT_PATTERNS = [
  /429/,
  /too many requests/i,
  /rate limit/i,
  /projected bursting/i,
  /-32005/,
];

const AUTH_PATTERNS = [
  /401/,
  /403/,
  /unauthorized/i,
  /forbidden/i,
  /invalid api key/i,
  /api key/i,
];

const TIMEOUT_PATTERNS = [/timeout/i, /timed out/i, /aborted/i, /aborterror/i];

const NETWORK_PATTERNS = [
  /econnreset/i,
  /econnrefused/i,
  /enotfound/i,
  /socket hang up/i,
  /fetch failed/i,
  /failed to fetch/i,
  /network/i,
];

const UNAVAILABLE_PATTERNS = [/502/, /503/, /504/, /gateway/i, /cloudflare/i];

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

export const parseRpcUrls = (
  primary?: string | null,
  fallbacks?: string | null,
): string[] => {
  const collected = [primary, ...(fallbacks ?? '').split(',')]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));
  return [...new Set(collected)];
};

/**
 * VOTAR-378 / UAT-02 — tráfico hacia nodos públicos debe ir por HTTPS.
 * HTTP sólo se admite en loopback (Hardhat / Anvil local).
 */
export const assertRpcUrlsUseHttpsExceptLoopback = (urls: string[]): void => {
  for (const url of urls) {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new Error(`RPC URL inválida: ${url}`);
    }
    const isLoopback = LOOPBACK_HOSTS.has(parsed.hostname);
    if (parsed.protocol === 'https:') {
      continue;
    }
    if (parsed.protocol === 'http:' && isLoopback) {
      continue;
    }
    throw new Error(
      `RPC URL debe usar HTTPS (Ley 25.326 / UAT-02): ${parsed.origin}`,
    );
  }
};

export const describeRpcEndpoint = (url: string): string => {
  try {
    const host = new URL(url).host.toLowerCase();
    if (host.includes('infura')) {
      return `infura (${host})`;
    }
    if (host.includes('alchemy')) {
      return `alchemy (${host})`;
    }
    if (host.includes('quicknode') || host.includes('quiknode')) {
      return `quicknode (${host})`;
    }
    return host;
  } catch {
    return 'invalid-rpc-url';
  }
};

export const sanitizeRpcUrl = (url: string): string => {
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split('/');
    const last = segments[segments.length - 1];
    if (last && last.length > 8) {
      segments[segments.length - 1] = `${last.slice(0, 4)}...`;
    }
    parsed.search = '';
    parsed.hash = '';
    return `${parsed.origin}${segments.join('/')}`;
  } catch {
    return '(invalid-url)';
  }
};

const errorText = (error: unknown): string => {
  if (error instanceof Error) {
    const code =
      'code' in error &&
      (typeof error.code === 'string' || typeof error.code === 'number')
        ? String(error.code)
        : '';
    return `${error.name} ${code} ${error.message}`;
  }
  if (typeof error === 'object' && error && 'status' in error) {
    return `HTTP ${String((error as { status?: unknown }).status)} ${JSON.stringify(error)}`;
  }
  return String(error);
};

export const classifyRpcFailoverReason = (
  error: unknown,
): RpcFailoverReason | null => {
  const text = errorText(error);
  const status =
    error && typeof error === 'object' && 'status' in error
      ? Number((error as { status?: unknown }).status)
      : Number.NaN;

  if (
    status === 429 ||
    RATE_LIMIT_PATTERNS.some((pattern) => pattern.test(text))
  ) {
    return 'rate_limit';
  }
  if (
    status === 401 ||
    status === 403 ||
    AUTH_PATTERNS.some((pattern) => pattern.test(text))
  ) {
    return 'auth';
  }
  if (
    status === 408 ||
    TIMEOUT_PATTERNS.some((pattern) => pattern.test(text))
  ) {
    return 'timeout';
  }
  if (
    status === 502 ||
    status === 503 ||
    status === 504 ||
    UNAVAILABLE_PATTERNS.some((pattern) => pattern.test(text))
  ) {
    return 'unavailable';
  }
  if (NETWORK_PATTERNS.some((pattern) => pattern.test(text))) {
    return 'network';
  }
  return null;
};

export const isRpcFailoverError = (error: unknown): boolean =>
  classifyRpcFailoverReason(error) != null;

export const isBlockSkewAcceptable = (
  referenceBlock: number,
  candidateBlock: number,
  maxSkew: number,
): boolean => {
  if (!Number.isFinite(referenceBlock) || !Number.isFinite(candidateBlock)) {
    return false;
  }
  return Math.abs(referenceBlock - candidateBlock) <= maxSkew;
};

export const formatRpcFailoverLog = (event: RpcFailoverEvent): string =>
  [
    `at=${event.at}`,
    `reason=${event.reason}`,
    `failed=${event.failedEndpoint}`,
    `backup=${event.backupEndpoint}`,
    event.blockSkew != null ? `skew=${event.blockSkew}` : null,
    `message=${event.message}`,
  ]
    .filter((part): part is string => part != null)
    .join(' ');
