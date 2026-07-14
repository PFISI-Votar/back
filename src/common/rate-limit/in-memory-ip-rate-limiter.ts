export type RateLimitDecision = {
  allowed: boolean;
  retryAfterSeconds: number;
  remaining: number;
};

/**
 * Sliding-window rate limiter in-memory por clave (típicamente IP).
 * No persiste datos; solo timestamps de requests recientes.
 */
export class InMemoryIpRateLimiter {
  private readonly attempts = new Map<string, number[]>();

  constructor(
    private readonly windowMs: number,
    private readonly maxRequests: number,
  ) {}

  consume(key: string, now = Date.now()): RateLimitDecision {
    const recent = (this.attempts.get(key) ?? []).filter(
      (timestamp) => now - timestamp < this.windowMs,
    );

    if (recent.length >= this.maxRequests) {
      const oldest = recent[0] ?? now;
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((oldest + this.windowMs - now) / 1000),
      );
      this.attempts.set(key, recent);
      return {
        allowed: false,
        retryAfterSeconds,
        remaining: 0,
      };
    }

    recent.push(now);
    this.attempts.set(key, recent);
    return {
      allowed: true,
      retryAfterSeconds: 0,
      remaining: Math.max(0, this.maxRequests - recent.length),
    };
  }

  /** Visible for tests. */
  reset(): void {
    this.attempts.clear();
  }
}
