import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '@/app.module';
import { configureApp } from '@/common/bootstrap/configure-app';
import * as securityHeaders from '@/config/security-headers.config';

describe('Security headers (e2e) — VOTAR-381', () => {
  let app: INestApplication<App>;
  const uploadsDir = join(process.cwd(), 'uploads-security-e2e');

  const expectCommonSecurityHeaders = (
    headers: request.Response['headers'],
  ): void => {
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['x-frame-options']).toBe('DENY');
    expect(headers['referrer-policy']).toBe('same-origin');
    expect(headers['permissions-policy']).toBe(
      'camera=(), microphone=(), geolocation=()',
    );
  };

  const createApp = async (development: boolean): Promise<void> => {
    // Crear un ConfigService mock que sobrescribe solo DEVELOPMENT
    const mockConfigService = {
      get: jest.fn((key: string) => {
        if (key === 'DEVELOPMENT') {
          return development; // Retorna boolean directamente
        }
        // Para otras keys, usar el valor real del proceso
        return process.env[key];
      }),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(ConfigService)
      .useValue(mockConfigService)
      .compile();

    app = moduleFixture.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();
  };

  beforeAll(() => {
    mkdirSync(uploadsDir, { recursive: true });
    writeFileSync(join(uploadsDir, 'fixture.txt'), 'fixture');
    process.env.UPLOADS_DIR = 'uploads-security-e2e';
  });

  afterEach(async () => {
    await app.close();
  });

  describe('development mode', () => {
    // Establecer DEVELOPMENT='true' antes de cualquier beforeEach para que
    // ConfigModule lo lea durante la compilación del módulo
    beforeAll(() => {
      process.env.DEVELOPMENT = 'true';
    });

    beforeEach(async () => {
      await createApp(true);
    });

    afterAll(() => {
      // Restaurar a false para otros test suites
      process.env.DEVELOPMENT = 'false';
    });

    it('GET / includes X-Content-Type-Options nosniff (UAT-05)', async () => {
      const response = await request(app.getHttpServer()).get('/').expect(200);
      expectCommonSecurityHeaders(response.headers);
      expect(response.headers['strict-transport-security']).toBeUndefined();
    });

    it('GET /uploads includes X-Content-Type-Options nosniff (UAT-05)', async () => {
      const response = await request(app.getHttpServer())
        .get('/uploads/fixture.txt')
        .expect(200);
      expectCommonSecurityHeaders(response.headers);
    });

    it('GET /api/docs includes security headers with Swagger CSP exception', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/docs')
        .expect(200);
      expectCommonSecurityHeaders(response.headers);
      expect(response.headers['content-security-policy']).toBeUndefined();
    });

    it('GET /elecciones includes security headers on API route (UAT-05)', async () => {
      const response = await request(app.getHttpServer())
        .get('/elecciones')
        .expect(401);
      expectCommonSecurityHeaders(response.headers);
      const csp = response.headers['content-security-policy'];
      expect(csp).toContain("default-src 'none'");
      expect(csp).toContain("frame-ancestors 'none'");
    });
  });

  describe('production mode', () => {
    beforeEach(async () => {
      jest.spyOn(securityHeaders, 'resolveIsProduction').mockReturnValue(true);
      await createApp(true);
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('GET / includes Strict-Transport-Security (HSTS)', async () => {
      const response = await request(app.getHttpServer())
        .get('/')
        .set('x-forwarded-proto', 'https')
        .expect(200);
      expectCommonSecurityHeaders(response.headers);
      expect(response.headers['strict-transport-security']).toBe(
        'max-age=31536000; includeSubDomains',
      );
    });
  });
});
