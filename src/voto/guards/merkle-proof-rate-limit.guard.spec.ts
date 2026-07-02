import { ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { MerkleProofRateLimitGuard } from './merkle-proof-rate-limit.guard';

describe('MerkleProofRateLimitGuard', () => {
  const guard = new MerkleProofRateLimitGuard();

  const buildContext = (ip: string | undefined) =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ ip }),
      }),
    }) as ExecutionContext;

  it('allows up to 5 requests per IP within the window', () => {
    for (let i = 0; i < 5; i++) {
      expect(guard.canActivate(buildContext('192.168.1.10'))).toBe(true);
    }
  });

  it('rejects the 6th request from the same IP with 429', () => {
    for (let i = 0; i < 5; i++) {
      guard.canActivate(buildContext('10.0.0.5'));
    }
    expect(() => guard.canActivate(buildContext('10.0.0.5'))).toThrow(
      HttpException,
    );
    try {
      guard.canActivate(buildContext('10.0.0.5'));
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  });

  it('tracks different IPs independently', () => {
    for (let i = 0; i < 5; i++) {
      guard.canActivate(buildContext('1.1.1.1'));
    }
    expect(guard.canActivate(buildContext('2.2.2.2'))).toBe(true);
  });
});
