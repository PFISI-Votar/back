import { InMemoryIpRateLimiter } from './in-memory-ip-rate-limiter';

describe('InMemoryIpRateLimiter', () => {
  it('allows up to maxRequests within the window', () => {
    const limiter = new InMemoryIpRateLimiter(60_000, 3);
    const now = 1_000_000;

    expect(limiter.consume('1.1.1.1', now).allowed).toBe(true);
    expect(limiter.consume('1.1.1.1', now + 1).allowed).toBe(true);
    expect(limiter.consume('1.1.1.1', now + 2).allowed).toBe(true);
    expect(limiter.consume('1.1.1.1', now + 3).allowed).toBe(false);
  });

  it('returns Retry-After based on the oldest request in the window', () => {
    const limiter = new InMemoryIpRateLimiter(60_000, 2);
    const now = 1_000_000;

    limiter.consume('10.0.0.1', now);
    limiter.consume('10.0.0.1', now + 5_000);
    const denied = limiter.consume('10.0.0.1', now + 10_000);

    expect(denied.allowed).toBe(false);
    expect(denied.retryAfterSeconds).toBe(50);
  });

  it('tracks keys independently', () => {
    const limiter = new InMemoryIpRateLimiter(60_000, 1);

    expect(limiter.consume('a').allowed).toBe(true);
    expect(limiter.consume('a').allowed).toBe(false);
    expect(limiter.consume('b').allowed).toBe(true);
  });
});
