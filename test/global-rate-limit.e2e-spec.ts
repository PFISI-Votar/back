import { Controller, Get, INestApplication, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { App } from 'supertest/types';
import { configureApp } from '@/common/bootstrap/configure-app';

@Controller()
class ProbeController {
  @Get()
  root(): string {
    return 'ok';
  }
}

@Module({
  controllers: [ProbeController],
  providers: [
    {
      provide: ConfigService,
      useValue: {
        get: (key: string) => {
          const values: Record<string, unknown> = {
            DEVELOPMENT: true,
            REQUIRE_HTTPS: false,
            FRONTEND_URL: 'http://localhost:5173',
            RATE_LIMIT_WINDOW_MS: 60_000,
            RATE_LIMIT_MAX_REQUESTS: 5,
          };
          return values[key];
        },
      },
    },
  ],
})
class RateLimitProbeModule {}

/**
 * VOTAR-394 — estrés de rate limiting global por IP en apiRouter.
 * App mínima sin TypeORM para aislar el middleware de configureApp.
 */
describe('Global rate limiting (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [RateLimitProbeModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects excess requests with HTTP 429 and Retry-After', async () => {
    const server = app.getHttpServer();

    for (let i = 0; i < 5; i++) {
      await request(server).get('/').expect(200);
    }

    const denied = await request(server).get('/').expect(429);
    expect(denied.headers['retry-after']).toBeDefined();
    expect(Number(denied.headers['retry-after'])).toBeGreaterThanOrEqual(1);
    expect(denied.body.message).toMatch(/Demasiadas solicitudes/i);
  });
});
