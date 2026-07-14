import type { NextFunction, Request, Response } from 'express';
import { createGlobalRateLimitMiddleware } from './global-rate-limit.middleware';

type HeaderStore = Record<string, string>;

const invoke = (
  middleware: (req: Request, res: Response, next: NextFunction) => void,
  ip: string,
  path = '/elecciones/1/configuracion-bud',
): Promise<{ status?: number; headers: HeaderStore; nextCalled: boolean }> => {
  const headers: HeaderStore = {};
  let status: number | undefined;
  let nextCalled = false;

  const req = {
    path,
    url: path,
    ip,
    headers: {},
  } as Request;

  const res = {
    setHeader(name: string, value: string | number) {
      headers[name.toLowerCase()] = String(value);
    },
    status(code: number) {
      status = code;
      return this;
    },
    json() {
      return this;
    },
  } as unknown as Response;

  return new Promise((resolve) => {
    middleware(req, res, () => {
      nextCalled = true;
      resolve({ status, headers, nextCalled });
    });
    if (!nextCalled) {
      resolve({ status, headers, nextCalled });
    }
  });
};

describe('createGlobalRateLimitMiddleware', () => {
  it('allows requests under the threshold and rejects with 429 + Retry-After', async () => {
    const middleware = createGlobalRateLimitMiddleware({
      windowMs: 60_000,
      maxRequests: 3,
    });

    await expect(invoke(middleware, '203.0.113.10')).resolves.toMatchObject({
      nextCalled: true,
    });
    await expect(invoke(middleware, '203.0.113.10')).resolves.toMatchObject({
      nextCalled: true,
    });
    await expect(invoke(middleware, '203.0.113.10')).resolves.toMatchObject({
      nextCalled: true,
    });

    const denied = await invoke(middleware, '203.0.113.10');
    expect(denied.nextCalled).toBe(false);
    expect(denied.status).toBe(429);
    expect(denied.headers['retry-after']).toBeDefined();
    expect(Number(denied.headers['retry-after'])).toBeGreaterThanOrEqual(1);
  });

  it('skips Swagger documentation paths', async () => {
    const middleware = createGlobalRateLimitMiddleware({
      windowMs: 60_000,
      maxRequests: 1,
    });

    await invoke(middleware, '198.51.100.1', '/api/docs');
    const second = await invoke(middleware, '198.51.100.1', '/api/docs');
    expect(second.nextCalled).toBe(true);
    expect(second.status).toBeUndefined();
  });

  it('tracks different IPs independently', async () => {
    const middleware = createGlobalRateLimitMiddleware({
      windowMs: 60_000,
      maxRequests: 1,
    });

    await invoke(middleware, '1.1.1.1');
    const other = await invoke(middleware, '2.2.2.2');
    expect(other.nextCalled).toBe(true);
  });
});
