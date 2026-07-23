import { RateLimitTier } from '@/common/rate-limit/rate-limit-tier.enum';

export interface RateLimitOptions {
  tier: RateLimitTier;
  /** Optional bucket key; defaults to tier when omitted. */
  bucket?: string;
  /** Override max attempts for this endpoint. */
  maxAttempts?: number;
  /** Override window size in milliseconds for this endpoint. */
  windowMs?: number;
  /** Custom Spanish error message. */
  message?: string;
}

export interface ResolvedRateLimitPolicy {
  maxAttempts: number;
  windowMs: number;
  message: string;
}
