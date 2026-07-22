import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RateLimitTier } from '@/common/rate-limit/rate-limit-tier.enum';
import {
  RateLimitOptions,
  ResolvedRateLimitPolicy,
} from '@/common/rate-limit/rate-limit-options.interface';

const DEFAULT_MESSAGES: Record<RateLimitTier, string> = {
  [RateLimitTier.AUTH]:
    'Demasiados intentos de autenticación. Intente nuevamente en breve.',
  [RateLimitTier.VOTE]:
    'Demasiadas solicitudes de emisión de voto. Intente nuevamente en un minuto.',
  [RateLimitTier.PUBLIC]:
    'Demasiadas consultas públicas. Intente nuevamente en un minuto.',
  [RateLimitTier.GLOBAL]:
    'Demasiadas solicitudes. Intente nuevamente en un minuto.',
};

@Injectable()
export class RateLimitConfigService {
  constructor(private readonly configService: ConfigService) {}

  resolvePolicy(options: RateLimitOptions): ResolvedRateLimitPolicy {
    const tierDefaults = this.getTierDefaults(options.tier);
    return {
      maxAttempts: options.maxAttempts ?? tierDefaults.maxAttempts,
      windowMs: options.windowMs ?? tierDefaults.windowMs,
      message: options.message ?? DEFAULT_MESSAGES[options.tier],
    };
  }

  private getTierDefaults(tier: RateLimitTier): {
    maxAttempts: number;
    windowMs: number;
  } {
    switch (tier) {
      case RateLimitTier.AUTH:
        return {
          maxAttempts:
            this.configService.get<number>('RATE_LIMIT_AUTH_MAX') ?? 10,
          windowMs:
            this.configService.get<number>('RATE_LIMIT_AUTH_WINDOW_MS') ?? 1000,
        };
      case RateLimitTier.VOTE:
        return {
          maxAttempts:
            this.configService.get<number>('RATE_LIMIT_VOTE_MAX') ?? 5,
          windowMs:
            this.configService.get<number>('RATE_LIMIT_VOTE_WINDOW_MS') ??
            60_000,
        };
      case RateLimitTier.PUBLIC:
        return {
          maxAttempts:
            this.configService.get<number>('RATE_LIMIT_PUBLIC_MAX') ?? 60,
          windowMs:
            this.configService.get<number>('RATE_LIMIT_PUBLIC_WINDOW_MS') ??
            60_000,
        };
      case RateLimitTier.GLOBAL:
        return {
          maxAttempts:
            this.configService.get<number>('RATE_LIMIT_GLOBAL_MAX') ?? 120,
          windowMs:
            this.configService.get<number>('RATE_LIMIT_GLOBAL_WINDOW_MS') ??
            60_000,
        };
      default:
        return { maxAttempts: 60, windowMs: 60_000 };
    }
  }
}
