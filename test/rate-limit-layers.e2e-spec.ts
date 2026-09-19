import { INestApplication, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '@/app.module';
import { AuthService } from '@/auth/services/auth.service';
import { VotanteAuthService } from '@/auth/services/votante-auth.service';
import { configureApp } from '@/common/bootstrap/configure-app';

/**
 * VOTAR-494 — completa la suite de VOTAR-380/381 demostrando que las tres
 * capas de rate limiting (AUTH/2FA, VOTE, PUBLIC) bloquean abuso de forma
 * independiente entre sí, y que el bloqueo de orígenes CORS no autorizados
 * también se sostiene fuera de /auth/login (VOTE y PUBLIC incluidos).
 *
 * Las ventanas de AUTH y VOTE se mantienen holgadas (60s) para que el
 * umbral se pruebe vía `maxAttempts` y no compita contra la duración de la
 * ráfaga secuencial de supertest (revisión PR#108).
 */
describe('Rate limiting layered abuse thresholds (e2e) — VOTAR-494', () => {
  let app: INestApplication<App>;
  const allowedOrigin = 'http://localhost:5173';
  const evilOrigin = 'https://evil.example.com';

  const createApp = async (
    envOverrides: Record<string, string> = {},
  ): Promise<void> => {
    process.env.FRONTEND_URL = allowedOrigin;
    process.env.CORS_ALLOWED_ORIGINS = allowedOrigin;
    process.env.DEVELOPMENT = 'true';
    process.env.RATE_LIMIT_AUTH_MAX = '10';
    process.env.RATE_LIMIT_AUTH_WINDOW_MS = '60000';
    process.env.RATE_LIMIT_VOTE_MAX = '5';
    process.env.RATE_LIMIT_VOTE_WINDOW_MS = '60000';
    process.env.RATE_LIMIT_PUBLIC_MAX = '60';
    process.env.RATE_LIMIT_PUBLIC_WINDOW_MS = '60000';
    Object.assign(process.env, envOverrides);

    const mockConfigService = {
      get: jest.fn((key: string) => {
        if (key === 'DEVELOPMENT') {
          return true;
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
      verifyTwoFactor: jest
        .fn()
        .mockRejectedValue(new UnauthorizedException('Código 2FA inválido')),
      refreshSession: jest
        .fn()
        .mockRejectedValue(
          new UnauthorizedException('Sesión de refresco inválida'),
        ),
      logout: jest.fn().mockResolvedValue(undefined),
    };

    const mockVotanteAuthService = {
      login: jest
        .fn()
        .mockRejectedValue(new UnauthorizedException('Credenciales inválidas')),
      getVoterAccessTtlSeconds: jest.fn().mockReturnValue(1800),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(ConfigService)
      .useValue(mockConfigService)
      .overrideProvider(AuthService)
      .useValue(mockAuthService)
      .overrideProvider(VotanteAuthService)
      .useValue(mockVotanteAuthService)
      .compile();

    app = moduleFixture.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();
  };

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('UAT-06 — AUTH/2FA layer: admin 2FA verify abuse threshold', () => {
    beforeEach(async () => {
      await createApp();
    });

    it('returns 429 after exceeding the auth tier limit on /auth/2fa/verify', async () => {
      const statuses: number[] = [];
      for (let i = 0; i < 15; i++) {
        const response = await request(app.getHttpServer())
          .post('/auth/2fa/verify')
          .set('Origin', allowedOrigin)
          .send({ challengeToken: 'invalid-token', code: '000000' });
        statuses.push(response.status);
      }
      expect(
        statuses.filter((status) => status === 429).length,
      ).toBeGreaterThan(0);

      const last429 = await request(app.getHttpServer())
        .post('/auth/2fa/verify')
        .set('Origin', allowedOrigin)
        .send({ challengeToken: 'invalid-token', code: '000000' })
        .expect(429);
      expect(last429.headers['retry-after']).toBeDefined();
    });

    it('keeps the 2fa/verify bucket independent from the admin login bucket', async () => {
      let last2faStatus = 0;
      for (let i = 0; i < 15; i++) {
        const response = await request(app.getHttpServer())
          .post('/auth/2fa/verify')
          .send({ challengeToken: 'invalid-token', code: '000000' });
        last2faStatus = response.status;
      }
      // Confirma que el bucket de 2fa/verify está agotado antes de medir
      // independencia; si no llegó a 429, un login sin 429 no prueba nada.
      expect(last2faStatus).toBe(429);

      const loginResponse = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ nick: 'admin', password: 'wrong' });
      expect(loginResponse.status).not.toBe(429);
    });
  });

  describe('UAT-07 — AUTH layer: votante login abuse threshold', () => {
    beforeEach(async () => {
      await createApp();
    });

    it('returns 429 after exceeding the auth tier limit on /auth/votante/login', async () => {
      const statuses: number[] = [];
      for (let i = 0; i < 15; i++) {
        const response = await request(app.getHttpServer())
          .post('/auth/votante/login')
          .set('Origin', allowedOrigin)
          .send({ nick: '14988', password: 'invalid', idEleccion: 1 });
        statuses.push(response.status);
      }
      expect(
        statuses.filter((status) => status === 429).length,
      ).toBeGreaterThan(0);

      const last429 = await request(app.getHttpServer())
        .post('/auth/votante/login')
        .set('Origin', allowedOrigin)
        .send({ nick: '14988', password: 'invalid', idEleccion: 1 })
        .expect(429);
      expect(last429.headers['retry-after']).toBeDefined();
    });

    it('keeps the votante login bucket independent from the admin login bucket', async () => {
      let lastVotanteLoginStatus = 0;
      for (let i = 0; i < 15; i++) {
        const response = await request(app.getHttpServer())
          .post('/auth/votante/login')
          .send({ nick: '14988', password: 'invalid', idEleccion: 1 });
        lastVotanteLoginStatus = response.status;
      }
      // Confirma que el bucket de votante/login está agotado antes de medir
      // independencia.
      expect(lastVotanteLoginStatus).toBe(429);

      const adminLoginResponse = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ nick: 'admin', password: 'wrong' });
      expect(adminLoginResponse.status).not.toBe(429);
    });
  });

  describe('UAT-08 — VOTE layer: firma de validación anónima abuse threshold', () => {
    beforeEach(async () => {
      await createApp();
    });

    it('returns 429 after exceeding the vote tier limit on /validacion/elecciones/:id/firma', async () => {
      const statuses: number[] = [];
      for (let i = 0; i < 10; i++) {
        const response = await request(app.getHttpServer())
          .post('/validacion/elecciones/1/firma')
          .set('Origin', allowedOrigin)
          .send({});
        statuses.push(response.status);
      }
      expect(
        statuses.filter((status) => status === 429).length,
      ).toBeGreaterThan(0);

      const last429 = await request(app.getHttpServer())
        .post('/validacion/elecciones/1/firma')
        .set('Origin', allowedOrigin)
        .send({})
        .expect(429);
      expect(last429.headers['retry-after']).toBeDefined();
    });

    it('does not affect the public tier bucket (clave-publica) under the same burst', async () => {
      let lastFirmaStatus = 0;
      for (let i = 0; i < 10; i++) {
        const response = await request(app.getHttpServer())
          .post('/validacion/elecciones/1/firma')
          .send({});
        lastFirmaStatus = response.status;
      }
      // Confirma que el bucket VOTE está agotado antes de medir independencia.
      expect(lastFirmaStatus).toBe(429);

      const publicResponse = await request(app.getHttpServer()).get(
        '/validacion/clave-publica',
      );
      expect(publicResponse.status).not.toBe(429);
    });
  });

  describe('UAT-09 — AUTH, VOTE y PUBLIC bloquean de forma independiente', () => {
    beforeEach(async () => {
      await createApp();
    });

    it('AUTH and VOTE each reach their own 429 threshold without affecting each other', async () => {
      let auth429At = -1;
      for (let i = 0; i < 20; i++) {
        const response = await request(app.getHttpServer())
          .post('/auth/login')
          .send({ nick: 'burst', password: 'burst' });
        if (auth429At === -1 && response.status === 429) {
          auth429At = i + 1;
        }
      }
      expect(auth429At).toBeGreaterThan(0);
      expect(auth429At).toBeLessThanOrEqual(11);

      let vote429At = -1;
      for (let i = 0; i < 20; i++) {
        const response = await request(app.getHttpServer())
          .post('/validacion/elecciones/1/firma')
          .send({});
        if (vote429At === -1 && response.status === 429) {
          vote429At = i + 1;
        }
      }
      expect(vote429At).toBeGreaterThan(0);
      expect(vote429At).toBeLessThanOrEqual(6);
    });

    describe('PUBLIC layer blocks independently once its own budget is exhausted', () => {
      beforeEach(async () => {
        // maxAttempts bajo y dedicado: RATE_LIMIT_PUBLIC_MAX por defecto (60)
        // nunca se agotaría con una ráfaga chica. /validacion/clave-publica
        // no sirve para esto porque tiene maxAttempts:20 hardcodeado y no lee
        // RATE_LIMIT_PUBLIC_MAX (revisión PR#108).
        await createApp({ RATE_LIMIT_PUBLIC_MAX: '5' });
      });

      it('returns 429 on GET /elecciones/:id/resultados after exceeding the public tier limit, without affecting AUTH/VOTE', async () => {
        const statuses: number[] = [];
        for (let i = 0; i < 10; i++) {
          const response = await request(app.getHttpServer()).get(
            '/elecciones/1/resultados',
          );
          statuses.push(response.status);
        }
        expect(
          statuses.filter((status) => status === 429).length,
        ).toBeGreaterThan(0);

        const last429 = await request(app.getHttpServer())
          .get('/elecciones/1/resultados')
          .expect(429);
        expect(last429.headers['retry-after']).toBeDefined();

        const authResponse = await request(app.getHttpServer())
          .post('/auth/login')
          .send({ nick: 'burst', password: 'burst' });
        expect(authResponse.status).not.toBe(429);

        const voteResponse = await request(app.getHttpServer())
          .post('/validacion/elecciones/1/firma')
          .send({});
        expect(voteResponse.status).not.toBe(429);
      });
    });
  });

  describe('UAT-10 — CORS bloquea orígenes no autorizados en las tres capas', () => {
    beforeEach(async () => {
      await createApp();
    });

    it('blocks a disallowed origin on the AUTH layer (votante login)', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/votante/login')
        .set('Origin', evilOrigin)
        .send({ nick: '14988', password: 'invalid', idEleccion: 1 });
      expect(response.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('rejects preflight from a disallowed origin on the VOTE layer', async () => {
      const response = await request(app.getHttpServer())
        .options('/validacion/elecciones/1/firma')
        .set('Origin', evilOrigin)
        .set('Access-Control-Request-Method', 'POST');
      expect(response.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('blocks a disallowed origin on the PUBLIC layer (resultados)', async () => {
      const response = await request(app.getHttpServer())
        .get('/elecciones/1/resultados')
        .set('Origin', evilOrigin);
      expect(response.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('allows the whitelisted origin on all three layers', async () => {
      const authResponse = await request(app.getHttpServer())
        .post('/auth/votante/login')
        .set('Origin', allowedOrigin)
        .send({ nick: '14988', password: 'invalid', idEleccion: 1 });
      expect(authResponse.headers['access-control-allow-origin']).toBe(
        allowedOrigin,
      );

      const voteResponse = await request(app.getHttpServer())
        .post('/validacion/elecciones/1/firma')
        .set('Origin', allowedOrigin)
        .send({});
      expect(voteResponse.headers['access-control-allow-origin']).toBe(
        allowedOrigin,
      );

      const publicResponse = await request(app.getHttpServer())
        .get('/elecciones/1/resultados')
        .set('Origin', allowedOrigin);
      expect(publicResponse.headers['access-control-allow-origin']).toBe(
        allowedOrigin,
      );
    });
  });
});
