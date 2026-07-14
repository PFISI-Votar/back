import { ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { MerkleProofRateLimitGuard } from './merkle-proof-rate-limit.guard';

type MockHttpResponse = {
  setHeader: (name: string, value: string) => void;
  headers: Record<string, string>;
};

describe('MerkleProofRateLimitGuard', () => {
  const guard = new MerkleProofRateLimitGuard();

  const buildContext = (ip: string | undefined) => {
    const headers: Record<string, string> = {};
    const response: MockHttpResponse = {
      setHeader(name: string, value: string) {
        headers[name.toLowerCase()] = value;
      },
      headers,
    };
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({ ip, headers: {} }),
        getResponse: (): MockHttpResponse => response,
      }),
    } as unknown as ExecutionContext;
    return { context, response };
  };

  it('allows up to 5 requests per IP within the window', () => {
    for (let i = 0; i < 5; i++) {
      expect(guard.canActivate(buildContext('192.168.1.10').context)).toBe(
        true,
      );
    }
  });

  it('rejects the 6th request from the same IP with 429 and Retry-After', () => {
    for (let i = 0; i < 5; i++) {
      guard.canActivate(buildContext('10.0.0.5').context);
    }

    const { context, response } = buildContext('10.0.0.5');
    expect(() => guard.canActivate(context)).toThrow(HttpException);
    try {
      guard.canActivate(context);
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    expect(response.headers['retry-after']).toBeDefined();
    expect(Number(response.headers['retry-after'])).toBeGreaterThanOrEqual(1);
  });

  it('tracks different IPs independently', () => {
    for (let i = 0; i < 5; i++) {
      guard.canActivate(buildContext('1.1.1.1').context);
    }
    expect(guard.canActivate(buildContext('2.2.2.2').context)).toBe(true);
  });
});
