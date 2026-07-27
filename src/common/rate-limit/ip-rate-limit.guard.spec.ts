import { ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RateLimitTier } from '@/common/rate-limit/rate-limit-tier.enum';
import { RATE_LIMIT_METADATA_KEY } from '@/common/rate-limit/rate-limit.constants';
import { RateLimitOptions } from '@/common/rate-limit/rate-limit-options.interface';
import { RateLimitConfigService } from '@/common/rate-limit/rate-limit.config';
import { IpRateLimitGuard } from '@/common/rate-limit/ip-rate-limit.guard';
import { IpRateLimitStore } from '@/common/rate-limit/ip-rate-limit.store';

describe('IpRateLimitGuard', () => {
  const store = new IpRateLimitStore();
  const rateLimitConfig = {
    resolvePolicy: jest.fn((options: RateLimitOptions) => ({
      maxAttempts: options.maxAttempts ?? 5,
      windowMs: options.windowMs ?? 60_000,
      message: options.message ?? 'Rate limit exceeded',
    })),
  } as unknown as RateLimitConfigService;

  const reflector = new Reflector();
  const guard = new IpRateLimitGuard(store, rateLimitConfig, reflector);

  const buildContext = (
    ip: string,
    headers: Record<string, string> = {},
  ): { context: ExecutionContext; getRetryAfter: () => string | undefined } => {
    const responseHeaders: Record<string, string> = {};
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({ ip, headers }),
        getResponse: () => ({
          setHeader: (name: string, value: string) => {
            responseHeaders[name.toLowerCase()] = value;
          },
        }),
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as ExecutionContext;
    return {
      context,
      getRetryAfter: () => responseHeaders['retry-after'],
    };
  };

  beforeEach(() => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue({
      tier: RateLimitTier.VOTE,
      bucket: 'test-vote',
      maxAttempts: 5,
      windowMs: 60_000,
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('allows up to maxAttempts requests within the window', () => {
    const { context } = buildContext('192.168.1.10');
    for (let i = 0; i < 5; i++) {
      expect(guard.canActivate(context)).toBe(true);
    }
  });

  it('rejects the 6th request from the same IP with 429', () => {
    const { context } = buildContext('10.0.0.5');
    for (let i = 0; i < 5; i++) {
      guard.canActivate(context);
    }
    expect(() => guard.canActivate(context)).toThrow(HttpException);
    try {
      guard.canActivate(context);
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  });

  it('tracks different IPs independently', () => {
    for (let i = 0; i < 5; i++) {
      guard.canActivate(buildContext('1.1.1.1').context);
    }
    expect(guard.canActivate(buildContext('2.2.2.2').context)).toBe(true);
  });

  it('tracks different tiers/buckets independently', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue({
      tier: RateLimitTier.VOTE,
      bucket: 'merkle-proof',
      maxAttempts: 5,
      windowMs: 60_000,
    });
    const sharedIp = buildContext('9.9.9.9');
    for (let i = 0; i < 5; i++) {
      guard.canActivate(sharedIp.context);
    }
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue({
      tier: RateLimitTier.PUBLIC,
      bucket: 'escrutinio',
      maxAttempts: 5,
      windowMs: 60_000,
    });
    expect(guard.canActivate(sharedIp.context)).toBe(true);
  });

  it('sets Retry-After header when rate limited', () => {
    const { context, getRetryAfter } = buildContext('8.8.8.8');
    for (let i = 0; i < 5; i++) {
      guard.canActivate(context);
    }
    try {
      guard.canActivate(context);
    } catch {
      // expected
    }
    expect(getRetryAfter()).toBeDefined();
  });

  it('passes through when no @RateLimit metadata is present', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    expect(guard.canActivate(buildContext('7.7.7.7').context)).toBe(true);
  });

  it('uses x-forwarded-for when resolving client IP', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) => {
      if (key === RATE_LIMIT_METADATA_KEY) {
        return {
          tier: RateLimitTier.AUTH,
          bucket: 'auth-forwarded',
          maxAttempts: 2,
          windowMs: 60_000,
        };
      }
      return undefined;
    });
    const forwardedContext = buildContext('127.0.0.1', {
      'x-forwarded-for': '203.0.113.50, 10.0.0.1',
    });
    expect(guard.canActivate(forwardedContext.context)).toBe(true);
    expect(guard.canActivate(forwardedContext.context)).toBe(true);
    expect(() => guard.canActivate(forwardedContext.context)).toThrow(
      HttpException,
    );
  });
});
