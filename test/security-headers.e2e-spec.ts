import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '@/app.module';
import { configureApp } from '@/common/bootstrap/configure-app';

describe('Security headers (e2e) — VOTAR-381', () => {
  let app: INestApplication<App>;
  const uploadsDir = join(process.cwd(), 'uploads-security-e2e');

  beforeAll(() => {
    mkdirSync(uploadsDir, { recursive: true });
    writeFileSync(join(uploadsDir, 'fixture.txt'), 'fixture');
    process.env.UPLOADS_DIR = 'uploads-security-e2e';
  });

  beforeEach(async () => {
    process.env.DEVELOPMENT = 'true';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

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

  it('GET / includes X-Content-Type-Options nosniff (UAT-05)', async () => {
    const response = await request(app.getHttpServer()).get('/').expect(200);
    expectCommonSecurityHeaders(response.headers);
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
});
