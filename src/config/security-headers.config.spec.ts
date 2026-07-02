import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import {
  createHelmetMiddleware,
  permissionsPolicyMiddleware,
  resolveIsProduction,
} from '@/config/security-headers.config';

type HeaderStore = Record<string, string | number | string[]>;

const invokeMiddleware = (
  middleware: (req: Request, res: Response, next: () => void) => void,
  path = '/',
): Promise<HeaderStore> => {
  const headers: HeaderStore = {};
  const req = { path, method: 'GET' } as Request;
  const res = {
    setHeader(name: string, value: string | number | readonly string[]) {
      headers[name.toLowerCase()] = value as string;
    },
    getHeader(name: string) {
      return headers[name.toLowerCase()];
    },
    removeHeader(name: string) {
      delete headers[name.toLowerCase()];
    },
  } as Response;

  return new Promise((resolve) => {
    middleware(req, res, () => resolve(headers));
  });
};

describe('security-headers.config', () => {
  describe('createHelmetMiddleware', () => {
    it('sets nosniff, DENY, same-origin and restrictive CSP in development', async () => {
      const middleware = createHelmetMiddleware(false);
      const headers = await invokeMiddleware(middleware, '/api/elecciones');

      expect(headers['x-content-type-options']).toBe('nosniff');
      expect(headers['x-frame-options']).toBe('DENY');
      expect(headers['referrer-policy']).toBe('same-origin');
      const csp = headers['content-security-policy'] as string;
      expect(csp).toContain("default-src 'none'");
      expect(csp).toContain("frame-ancestors 'none'");
      expect(headers['strict-transport-security']).toBeUndefined();
    });

    it('sets HSTS in production', async () => {
      const middleware = createHelmetMiddleware(true);
      const headers = await invokeMiddleware(middleware, '/api/elecciones');

      expect(headers['strict-transport-security']).toBe(
        'max-age=31536000; includeSubDomains',
      );
      expect(headers['x-content-type-options']).toBe('nosniff');
      expect(headers['x-frame-options']).toBe('DENY');
      expect(headers['referrer-policy']).toBe('same-origin');
    });

    it('disables CSP on Swagger paths', async () => {
      const middleware = createHelmetMiddleware(false);
      const headers = await invokeMiddleware(middleware, '/api/docs');

      expect(headers['content-security-policy']).toBeUndefined();
      expect(headers['x-content-type-options']).toBe('nosniff');
      expect(headers['x-frame-options']).toBe('DENY');
    });
  });

  describe('permissionsPolicyMiddleware', () => {
    it('sets Permissions-Policy header', async () => {
      const headers = await invokeMiddleware(permissionsPolicyMiddleware);

      expect(headers['permissions-policy']).toBe(
        'camera=(), microphone=(), geolocation=()',
      );
    });
  });

  describe('resolveIsProduction', () => {
    it('returns true when DEVELOPMENT is false', () => {
      const configService = {
        get: jest.fn().mockReturnValue(false),
      } as unknown as ConfigService;

      expect(resolveIsProduction(configService)).toBe(true);
    });

    it('returns false when DEVELOPMENT is true', () => {
      const configService = {
        get: jest.fn().mockReturnValue(true),
      } as unknown as ConfigService;

      expect(resolveIsProduction(configService)).toBe(false);
    });
  });
});
