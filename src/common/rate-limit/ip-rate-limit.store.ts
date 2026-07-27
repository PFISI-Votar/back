import { Injectable } from '@nestjs/common';

export interface RateLimitCheckResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

/**
 * In-memory sliding-window rate limit store (VOTAR-380).
 * IP is used only for throttling and is never persisted.
 * Not shared across multiple server instances.
 */
@Injectable()
export class IpRateLimitStore {
  private readonly attempts = new Map<string, number[]>();

  checkAndRecord(
    bucketKey: string,
    maxAttempts: number,
    windowMs: number,
  ): RateLimitCheckResult {
    const now = Date.now();
    const recentAttempts = (this.attempts.get(bucketKey) ?? []).filter(
      (timestamp) => now - timestamp < windowMs,
    );
    if (recentAttempts.length >= maxAttempts) {
      const oldest = recentAttempts[0] ?? now;
      const retryAfterMs = Math.max(0, windowMs - (now - oldest));
      return {
        allowed: false,
        retryAfterSeconds: Math.ceil(retryAfterMs / 1000) || 1,
      };
    }
    recentAttempts.push(now);
    this.attempts.set(bucketKey, recentAttempts);
    return { allowed: true, retryAfterSeconds: 0 };
  }
}
