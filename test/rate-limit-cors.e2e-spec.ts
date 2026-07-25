import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { INestApplication, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '@/app.module';
import { AuthService } from '@/auth/services/auth.service';
import { configureApp } from '@/common/bootstrap/configure-app';
import * as securityHeaders from '@/config/security-headers.config';

describe('Rate limiting and CORS (e2e) — VOTAR-380', () => {
  let app: INestApplication<App>;
  const uploadsDir = join(process.cwd(), 'uploads-rate-limit-cors-e2e');
  const allowedOrigin = 'http://localhost:5173';

  const createApp = async (development: boolean): Promise<void> => {
    process.env.FRONTEND_URL = allowedOrigin;
    process.env.CORS_ALLOWED_ORIGINS = allowedOrigin;
    process.env.RATE_LIMIT_AUTH_MAX = '10';
    process.env.RATE_LIMIT_AUTH_WINDOW_MS = '1000';
    process.env.RATE_LIMIT_PUBLIC_MAX = '60';
    process.env.RATE_LIMIT_PUBLIC_WINDOW_MS = '60000';

    const mockConfigService = {
      get: jest.fn((key: string) => {
        if (key === 'DEVELOPMENT') {
          return development;
        }
        const value = process.env[key];
        if (
          key.startsWith('RATE_LIMIT_') &&
          value !== undefined &&
          value !== ''
        ) {
          return Number(value);
        }
        return value;
      }),
    };

    const mockAuthService = {
      login: jest
        .fn()
        .mockRejectedValue(new UnauthorizedException('Credenciales inválidas')),
      refreshSession: jest
        .fn()
        .mockRejectedValue(
          new UnauthorizedException('Sesión de refresco inválida'),
        ),
      logout: jest.fn().mockResolvedValue(undefined),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(ConfigService)
      .useValue(mockConfigService)
      .overrideProvider(AuthService)
      .useValue(mockAuthService)
      .compile();

    app = moduleFixture.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();
  };

  beforeAll(() => {
    mkdirSync(uploadsDir, { recursive: true });
    writeFileSync(join(uploadsDir, 'fixture.txt'), 'fixture');
    process.env.UPLOADS_DIR = 'uploads-rate-limit-cors-e2e';
    process.env.DEVELOPMENT = 'true';
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('UAT-01 — CORS whitelist', () => {
    beforeEach(async () => {
      await createApp(true);
    });

    it('rejects unauthorized Origin on API requests', async () => {
      const response = await request(app.getHttpServer())
        .get('/')
        .set('Origin', 'https://evil.example.com')
        .expect(200);
      expect(response.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('allows whitelisted Origin on API requests', async () => {
      const response = await request(app.getHttpServer())
        .get('/')
        .set('Origin', allowedOrigin)
        .expect(200);
      expect(response.headers['access-control-allow-origin']).toBe(
        allowedOrigin,
      );
    });

    it('rejects preflight OPTIONS from unauthorized origin', async () => {
      const response = await request(app.getHttpServer())
        .options('/auth/login')
        .set('Origin', 'https://evil.example.com')
        .set('Access-Control-Request-Method', 'POST');
      expect(response.headers['access-control-allow-origin']).toBeUndefined();
    });
  });

  describe('UAT-02 — Auth burst rate limit', () => {
    beforeEach(async () => {
      await createApp(true);
    });

    it('returns HTTP 429 after exceeding auth tier limit', async () => {
      const statuses: number[] = [];
      for (let i = 0; i < 15; i++) {
        const response = await request(app.getHttpServer())
          .post('/auth/login')
          .set('Origin', allowedOrigin)
          .send({ nick: 'invalid', password: 'invalid' });
        statuses.push(response.status);
      }
      expect(
        statuses.filter((status) => status === 429).length,
      ).toBeGreaterThan(0);
      const last429 = await request(app.getHttpServer())
        .post('/auth/login')
        .set('Origin', allowedOrigin)
        .send({ nick: 'invalid', password: 'invalid' })
        .expect(429);
      expect(last429.headers['retry-after']).toBeDefined();
    });
  });

  describe('UAT-03 — HTTP method restriction', () => {
    beforeEach(async () => {
      await createApp(true);
    });

    it('rejects DELETE on POST-only auth/login route', async () => {
      const response = await request(app.getHttpServer()).delete('/auth/login');
      expect([404, 405]).toContain(response.status);
    });

    it('allows DELETE in CORS preflight (VOTAR-429)', async () => {
      const response = await request(app.getHttpServer())
        .options('/auth/login')
        .set('Origin', allowedOrigin)
        .set('Access-Control-Request-Method', 'DELETE');
      const allowedMethods =
        response.headers['access-control-allow-methods'] ?? '';
      expect(String(allowedMethods).toUpperCase()).toContain('DELETE');
    });
  });

  describe('UAT-04 — Security headers on legitimate responses', () => {
    beforeEach(async () => {
      await createApp(true);
    });

    it('includes X-Content-Type-Options and X-Frame-Options', async () => {
      const response = await request(app.getHttpServer())
        .get('/')
        .set('Origin', allowedOrigin)
        .expect(200);
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-frame-options']).toBe('DENY');
    });

    it('includes security headers on 429 responses', async () => {
      for (let i = 0; i < 11; i++) {
        await request(app.getHttpServer())
          .post('/auth/login')
          .send({ nick: 'x', password: 'y' });
      }
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ nick: 'x', password: 'y' })
        .expect(429);
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-frame-options']).toBe('DENY');
    });
  });

  describe('UAT-05 — Auth tier blocks faster than public tier', () => {
    beforeEach(async () => {
      await createApp(true);
    });

    it('auth login reaches 429 before public resultados under burst load', async () => {
      let auth429At = -1;
      for (let i = 0; i < 50; i++) {
        const authResponse = await request(app.getHttpServer())
          .post('/auth/login')
          .send({ nick: 'burst', password: 'burst' });
        if (auth429At === -1 && authResponse.status === 429) {
          auth429At = i + 1;
        }
      }

      let public429At = -1;
      for (let i = 0; i < 50; i++) {
        const publicResponse = await request(app.getHttpServer()).get(
          '/elecciones/1/resultados',
        );
        if (public429At === -1 && publicResponse.status === 429) {
          public429At = i + 1;
        }
      }

      expect(auth429At).toBeGreaterThan(0);
      expect(auth429At).toBeLessThanOrEqual(11);
      expect(public429At).toBe(-1);
    });
  });

  describe('production HSTS regression — VOTAR-381', () => {
    beforeEach(async () => {
      jest.spyOn(securityHeaders, 'resolveIsProduction').mockReturnValue(true);
      await createApp(true);
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('includes Strict-Transport-Security in production mode', async () => {
      const response = await request(app.getHttpServer())
        .get('/')
        .set('x-forwarded-proto', 'https')
        .expect(200);
      expect(response.headers['strict-transport-security']).toBe(
        'max-age=31536000; includeSubDomains',
      );
    });
  });
});
