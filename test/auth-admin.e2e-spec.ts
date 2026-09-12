import cookieParser from 'cookie-parser';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { newDb } from 'pg-mem';
import { DataSource, IsNull, Repository } from 'typeorm';
import { AuditLoggerService } from '@/audit/audit-logger.service';
import { AuditLog } from '@/audit/entities/audit-log.entity';
import { TipoEventoAudit } from '@/audit/enums/tipo-evento-audit.enum';
import { AuthModule } from '@/auth/auth.module';
import { AutoridadElectoral } from '@/auth/entities/autoridad-electoral.entity';
import { RefreshSession } from '@/auth/entities/refresh-session.entity';
import { ConfiguracionSistema } from '@/configuracion-sistema/entities/configuracion-sistema.entity';
import { JwtRole } from '@/auth/enums/jwt-role.enum';
import { RolAutoridad } from '@/auth/enums/rol-autoridad.enum';
import { AutogestionService } from '@/auth/services/autogestion.service';
import { TotpService } from '@/auth/services/totp.service';
import { EleccionesModule } from '@/eleccion/eleccion.module';
import { Eleccion } from '@/eleccion/entities/eleccion.entity';
import { Boleta } from '@/eleccion/lista/entities/boleta.entity';
import { Categoria } from '@/eleccion/lista/entities/categoria.entity';
import { Lista } from '@/eleccion/lista/entities/lista.entity';
import { Candidato } from '@/eleccion/candidato/entities/candidato.entity';
import { ConfiguracionDatosCandidato } from '@/eleccion/candidato/entities/configuracion-datos-candidato.entity';
import { CampoDatosCandidato } from '@/eleccion/candidato/entities/campo-datos-candidato.entity';
import { ConfiguracionComicio } from '@/eleccion/configuracion-comicio/entities/configuracion-comicio.entity';
import { issueTestSessionToken, withBearer } from './helpers/auth-test.helper';

type TwoFactorLoginBody = {
  user?: { role: string; sub: string };
  accessToken?: string;
  twoFactor?: {
    status: 'setup_required' | 'verification_required';
    challengeToken: string;
    secret?: string;
  };
};

const ADMIN_LOGIN = { nick: 'votar.admin', password: 'secret' };

const adminPersona = {
  legajo: '14988',
  nombre: 'Admin',
  apellido: 'Test',
  email: 'admin@test.local',
};

const entities = [
  Eleccion,
  Boleta,
  Categoria,
  Lista,
  Candidato,
  ConfiguracionDatosCandidato,
  CampoDatosCandidato,
  ConfiguracionComicio,
  AutoridadElectoral,
  RefreshSession,
  ConfiguracionSistema,
  AuditLog,
];

const mockAutogestionService = {
  login: jest.fn().mockResolvedValue('hash-test'),
  fetchUsuario: jest.fn(),
};

describe('AuthAdmin (e2e) — US-313', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let jwtService: JwtService;
  let totpService: TotpService;
  let autoridadRepository: Repository<AutoridadElectoral>;
  let auditLogRepository: Repository<AuditLog>;
  let auditLogger: AuditLoggerService;
  let adminToken: string;
  let voterToken: string;

  const mockAdminAutogestion = () => {
    mockAutogestionService.fetchUsuario.mockResolvedValueOnce({
      persona: adminPersona,
    });
  };

  /** Login admin + verificación TOTP; cookies solo tras /auth/2fa/verify. */
  const loginAdminCompleting2fa = async (
    http: request.SuperTest<request.Test> | request.SuperAgentTest,
  ) => {
    mockAdminAutogestion();
    const loginResponse = await http
      .post('/auth/login')
      .send(ADMIN_LOGIN)
      .expect(200);

    const loginBody = loginResponse.body as TwoFactorLoginBody;
    expect(loginBody.twoFactor).toBeDefined();
    expect(loginBody.user).toBeUndefined();
    expect(loginResponse.headers['set-cookie']).toBeUndefined();

    let secret = loginBody.twoFactor?.secret;
    if (!secret) {
      const autoridad = await autoridadRepository.findOne({
        where: { identificadorSso: ADMIN_LOGIN.nick },
      });
      secret = autoridad?.totpSecret ?? undefined;
    }
    expect(secret).toBeDefined();

    return http
      .post('/auth/2fa/verify')
      .send({
        challengeToken: loginBody.twoFactor!.challengeToken,
        code: totpService.generateCode(secret!),
      })
      .expect(200);
  };

  beforeAll(async () => {
    const db = newDb({ autoCreateForeignKeyIndices: true });
    db.public.registerFunction({
      name: 'current_database',
      implementation: () => 'test',
    });
    db.public.registerFunction({
      name: 'version',
      implementation: () => 'PostgreSQL 16.0',
    });

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [
            () => ({
              JWT_SECRET: 'test-secret-for-e2e-tests-min-16',
              JWT_ACCESS_EXPIRES_IN: '15m',
              JWT_REFRESH_EXPIRES_IN: '8h',
              SESSION_IDLE_TIMEOUT: '30m',
              SESSION_ACTIVITY_WRITE_INTERVAL: '60s',
              AUTOGESTION_BASE_URL: 'https://autogestion.test',
              DEVELOPMENT: true,
            }),
          ],
        }),
        TypeOrmModule.forRootAsync({
          useFactory: () => ({
            type: 'postgres' as const,
            entities,
            synchronize: true,
          }),
          dataSourceFactory: async (options) => {
            dataSource = await db.adapters.createTypeormDataSource(options);
            return dataSource;
          },
        }),
        AuthModule,
        EleccionesModule,
      ],
    })
      .overrideProvider(AutogestionService)
      .useValue(mockAutogestionService)
      .compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    jwtService = app.get(JwtService);
    totpService = app.get(TotpService);
    adminToken = await issueTestSessionToken(dataSource, jwtService, {
      sub: '14988',
      role: JwtRole.ELECTION_ADMIN,
      email: 'admin@test.local',
    });
    voterToken = await issueTestSessionToken(dataSource, jwtService, {
      sub: '15079',
      role: JwtRole.VOTER,
      email: 'voter@test.local',
    });

    autoridadRepository = dataSource.getRepository(AutoridadElectoral);
    await autoridadRepository.save({
      identificadorSso: 'votar.admin',
      email: 'admin@test.local',
      nombre: 'Admin Test',
      rol: RolAutoridad.ELECTION_ADMIN,
    });

    auditLogRepository = dataSource.getRepository(AuditLog);
    auditLogger = app.get(AuditLoggerService);
  }, 30000);

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }
  });

  it('UAT-01: election_admin accede a GET /elecciones con 200', async () => {
    await request(app.getHttpServer())
      .get('/elecciones')
      .set(withBearer(adminToken))
      .expect(200);
  });

  it('UAT-02: usuario voter recibe 403 al acceder a ruta de gestión', async () => {
    await request(app.getHttpServer())
      .get('/elecciones')
      .set(withBearer(voterToken))
      .expect(403);
  });

  it('UAT-03: intento no autorizado registra entrada en audit_log', async () => {
    const countBefore = await auditLogRepository.count({
      where: { tipoEvento: TipoEventoAudit.ACCESO_DENEGADO },
    });

    await request(app.getHttpServer())
      .get('/elecciones')
      .set(withBearer(voterToken))
      .expect(403);

    const logs = await auditLogRepository.find({
      where: { tipoEvento: TipoEventoAudit.ACCESO_DENEGADO },
      order: { timestamp: 'DESC' },
    });

    expect(logs.length).toBeGreaterThan(countBefore);
    const latest = logs[0];
    // VOTAR-370: actor ofuscado (no sub SSO en claro)
    expect(latest.actor).toBe(auditLogger.ofuscarOperador('15079'));
    expect(latest.endpoint).toBe('GET /elecciones');
    expect(latest.ipOrigen).toBeDefined();
    expect(latest.ipOrigen).not.toMatch(/^\d{1,3}(?:\.\d{1,3}){3}$/);
    expect(latest.timestamp).toBeDefined();
  });

  it('POST /auth/login admin exige 2FA y no emite cookies hasta verificar TOTP', async () => {
    const response = await loginAdminCompleting2fa(
      request(app.getHttpServer()),
    );

    const body = response.body as TwoFactorLoginBody;
    expect(body.accessToken).toBeUndefined();
    expect(body.user?.role).toBe(JwtRole.ELECTION_ADMIN);

    const cookieHeader = (response.headers['set-cookie'] as string[]).join(';');
    expect(cookieHeader).toContain('votar_refresh_token=');
    expect(cookieHeader).toContain('votar_access_token=');
    expect(cookieHeader.toLowerCase()).toContain('httponly');

    const accessTokenMatch = cookieHeader.match(/votar_access_token=([^;]+)/);
    const accessToken = accessTokenMatch?.[1];
    expect(accessToken).toBeDefined();
    const decoded = jwtService.decode(accessToken as string);
    expect(decoded.role).toBe(JwtRole.ELECTION_ADMIN);
  });

  it('GET /elecciones funciona con cookie de access tras login + 2FA', async () => {
    const agent = request.agent(app.getHttpServer());
    await loginAdminCompleting2fa(agent);

    await agent.get('/elecciones').expect(200);
  });

  it('POST /auth/refresh renueva access token con cookie de sesión', async () => {
    const agent = request.agent(app.getHttpServer());
    await loginAdminCompleting2fa(agent);

    const refreshResponse = await agent.post('/auth/refresh').expect(200);
    const refreshBody = refreshResponse.body as {
      user: { role: string };
      accessToken?: string;
    };

    expect(refreshBody.accessToken).toBeUndefined();
    expect(refreshBody.user.role).toBe(JwtRole.ELECTION_ADMIN);
    expect(
      (refreshResponse.headers['set-cookie'] as string[]).join(';'),
    ).toContain('votar_access_token=');
  });

  it('POST /auth/logout revoca la sesión de refresh', async () => {
    const agent = request.agent(app.getHttpServer());
    await loginAdminCompleting2fa(agent);

    await agent.post('/auth/logout').expect(204);
    await agent.post('/auth/refresh').expect(401);
  });

  it('VOTAR-492: logout limpia ambas cookies y es idempotente (204 en la 2da llamada)', async () => {
    const agent = request.agent(app.getHttpServer());
    await loginAdminCompleting2fa(agent);

    const primerLogout = await agent.post('/auth/logout').expect(204);
    const cookies = (primerLogout.headers['set-cookie'] as string[]).join(';');
    expect(cookies).toMatch(/votar_access_token=;/);
    expect(cookies).toMatch(/votar_refresh_token=;/);

    // Idempotencia: la sesión ya está revocada, igual devuelve 204 y no 401.
    await agent.post('/auth/logout').expect(204);
  });

  it('VOTAR-492: revocar la sesión invalida el access token vigente de inmediato', async () => {
    const agent = request.agent(app.getHttpServer());
    await loginAdminCompleting2fa(agent);

    await agent.get('/auth/me').expect(200);

    // Revocación fuera de banda (contención de incidente): marca revoked_at.
    const sessionRepo = dataSource.getRepository(RefreshSession);
    await sessionRepo.update(
      { revokedAt: IsNull() },
      { revokedAt: new Date(), revokedReason: 'REVOCACION_ADMIN' },
    );

    // La MISMA cookie de access (no expirada) ahora es rechazada.
    await agent.get('/auth/me').expect(401);
  });

  it('VOTAR-492: una sesión inactiva más allá del timeout es rechazada en /auth/me y /auth/refresh', async () => {
    const agent = request.agent(app.getHttpServer());
    await loginAdminCompleting2fa(agent);

    // Simula 31 min de inactividad (SESSION_IDLE_TIMEOUT = 30m).
    const sessionRepo = dataSource.getRepository(RefreshSession);
    await sessionRepo.update(
      { revokedAt: IsNull() },
      { lastActivityAt: new Date(Date.now() - 31 * 60_000) },
    );

    await agent.get('/auth/me').expect(401);
    await agent.post('/auth/refresh').expect(401);
  });

  it('VOTAR-492: /auth/refresh no extiende expires_at ni cambia id_session', async () => {
    const agent = request.agent(app.getHttpServer());
    await loginAdminCompleting2fa(agent);

    const sessionRepo = dataSource.getRepository(RefreshSession);
    const antes = await sessionRepo.findOne({
      where: { revokedAt: IsNull() },
      order: { idSession: 'DESC' },
    });

    await agent.post('/auth/refresh').expect(200);

    const despues = await sessionRepo.findOne({
      where: { idSession: antes!.idSession },
    });
    expect(despues).not.toBeNull();
    expect(despues!.revokedAt).toBeNull();
    expect(despues!.expiresAt.getTime()).toBe(antes!.expiresAt.getTime());
  });

  it('POST /auth/login emite JWT con role voter para usuario sin autoridad', async () => {
    mockAutogestionService.fetchUsuario.mockResolvedValueOnce({
      persona: {
        legajo: '15079',
        nombre: 'Voter',
        email: 'voter@test.local',
      },
    });

    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ nick: '15079', password: 'secret' })
      .expect(200);

    const body = response.body as { user: { role: string } };
    expect(body.user.role).toBe(JwtRole.VOTER);
  });

  it('GET /elecciones sin token retorna 401', async () => {
    await request(app.getHttpServer()).get('/elecciones').expect(401);
  });
});
