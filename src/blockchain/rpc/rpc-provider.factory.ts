import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JsonRpcProvider, type Provider } from 'ethers';
import { FailoverJsonRpcProvider } from './failover-json-rpc.provider';
import {
  RPC_FAILOVER_LOG_PREFIX,
  RPC_FAILOVER_TIMEOUT_MS,
  RPC_MAX_BLOCK_SKEW,
} from './rpc-failover.constants';
import { parseRpcUrls } from './rpc-failover.util';

@Injectable()
export class RpcProviderFactory {
  private readonly logger = new Logger(RpcProviderFactory.name);
  private cachedProvider: Provider | null = null;
  private cachedUrlsKey: string | null = null;

  constructor(private readonly configService: ConfigService) {}

  getUrls(): string[] {
    return parseRpcUrls(
      this.configService.get<string>('SEPOLIA_RPC_URL'),
      this.configService.get<string>('SEPOLIA_RPC_FALLBACK_URLS'),
    );
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

    const provider =
      urls.length === 1
        ? new JsonRpcProvider(urls[0])
        : new FailoverJsonRpcProvider(urls, {
            chainId,
            timeoutMs,
            maxBlockSkew,
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
}
