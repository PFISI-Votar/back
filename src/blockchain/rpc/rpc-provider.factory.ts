import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Provider } from 'ethers';
import { FailoverJsonRpcProvider } from './failover-json-rpc.provider';
import {
  RPC_FAILOVER_LOG_PREFIX,
  RPC_FAILOVER_TIMEOUT_MS,
  RPC_MAX_BLOCK_SKEW,
  RPC_RETRY_BASE_DELAY_MS,
  RPC_RETRY_MAX_RETRIES,
} from './rpc-failover.constants';
import {
  assertRpcUrlsUseHttpsExceptLoopback,
  parseRpcUrls,
} from './rpc-failover.util';

@Injectable()
export class RpcProviderFactory {
  private readonly logger = new Logger(RpcProviderFactory.name);
  private cachedProvider: Provider | null = null;
  private cachedUrlsKey: string | null = null;

  constructor(private readonly configService: ConfigService) {}

  getUrls(): string[] {
    const urls = parseRpcUrls(
      this.configService.get<string>('SEPOLIA_RPC_URL'),
      this.configService.get<string>('SEPOLIA_RPC_FALLBACK_URLS'),
    );
    assertRpcUrlsUseHttpsExceptLoopback(urls);
    return urls;
  }

  hasUrls(): boolean {
    return this.getUrls().length > 0;
  }

  create(): Provider {
    const urls = this.getUrls();
    if (urls.length === 0) {
      throw new ServiceUnavailableException(
        'La consulta on-chain no está configurada (SEPOLIA_RPC_URL).',
      );
    }

    const urlsKey = urls.join('|');
    if (this.cachedProvider && this.cachedUrlsKey === urlsKey) {
      return this.cachedProvider;
    }

    const chainId = Number(
      this.configService.get<number>('CHAIN_ID') ?? 11_155_111,
    );
    const timeoutMs = Number(
      this.configService.get<number>('RPC_FAILOVER_TIMEOUT_MS') ??
        RPC_FAILOVER_TIMEOUT_MS,
    );
    const maxBlockSkew = Number(
      this.configService.get<number>('RPC_MAX_BLOCK_SKEW') ??
        RPC_MAX_BLOCK_SKEW,
    );

    const maxRetries = Number(
      this.configService.get<number>('RPC_RETRY_MAX_RETRIES') ??
        RPC_RETRY_MAX_RETRIES,
    );
    const baseDelayMs = Number(
      this.configService.get<number>('RPC_RETRY_BASE_DELAY_MS') ??
        RPC_RETRY_BASE_DELAY_MS,
    );
    const cacheEnabled =
      this.configService.get<boolean>('RPC_CACHE_ENABLED') !== false;
    const accessHeaders = this.getCloudflareAccessHeaders();

    // Use the resilient transport even with a single URL. Besides provider
    // rotation, it supplies the timeout, transient retries and response
    // coalescing needed by the public dashboard and voting endpoints. The
    // previous single-URL JsonRpcProvider path could leave requests hanging
    // until the reverse proxy reset the socket (ECONNRESET).
    const provider = new FailoverJsonRpcProvider(urls, {
      chainId,
      timeoutMs,
      maxBlockSkew,
      retry: { maxRetries, baseDelayMs },
      cache: cacheEnabled ? {} : false,
      // Never forward the private service token to third-party backups.
      headersByUrl: accessHeaders ? { [urls[0]]: accessHeaders } : undefined,
      logger: {
        warn: (message, ...optionalParams) => {
          this.logger.warn(
            `${RPC_FAILOVER_LOG_PREFIX} ${message}`,
            ...optionalParams,
          );
        },
      },
    });

    this.cachedProvider = provider;
    this.cachedUrlsKey = urlsKey;
    return provider;
  }

  private getCloudflareAccessHeaders(): Record<string, string> | null {
    const clientId = this.configService
      .get<string>('CF_ACCESS_CLIENT_ID')
      ?.trim();
    const clientSecret = this.configService
      .get<string>('CF_ACCESS_CLIENT_SECRET')
      ?.trim();
    if (!clientId && !clientSecret) {
      return null;
    }
    if (!clientId || !clientSecret) {
      throw new ServiceUnavailableException(
        'Cloudflare Access requiere CF_ACCESS_CLIENT_ID y CF_ACCESS_CLIENT_SECRET.',
      );
    }
    return {
      'CF-Access-Client-Id': clientId,
      'CF-Access-Client-Secret': clientSecret,
    };
  }
}
