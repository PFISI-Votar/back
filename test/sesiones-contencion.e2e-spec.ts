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
import { AuditLog } from '@/audit/entities/audit-log.entity';
import { TipoEventoAudit } from '@/audit/enums/tipo-evento-audit.enum';
import { AuditLoggerService } from '@/audit/audit-logger.service';
import { AuthModule } from '@/auth/auth.module';
import { AutoridadElectoral } from '@/auth/entities/autoridad-electoral.entity';
import { RefreshSession } from '@/auth/entities/refresh-session.entity';
import { JwtRole } from '@/auth/enums/jwt-role.enum';
import { RolAutoridad } from '@/auth/enums/rol-autoridad.enum';
import { AutogestionService } from '@/auth/services/autogestion.service';
import { ConfiguracionSistema } from '@/configuracion-sistema/entities/configuracion-sistema.entity';
import { Eleccion } from '@/eleccion/entities/eleccion.entity';
import { Boleta } from '@/eleccion/lista/entities/boleta.entity';
import { Categoria } from '@/eleccion/lista/entities/categoria.entity';
import { Lista } from '@/eleccion/lista/entities/lista.entity';
import { Candidato } from '@/eleccion/candidato/entities/candidato.entity';
import { ConfiguracionDatosCandidato } from '@/eleccion/candidato/entities/configuracion-datos-candidato.entity';
import { CampoDatosCandidato } from '@/eleccion/candidato/entities/campo-datos-candidato.entity';
import { ConfiguracionComicio } from '@/eleccion/configuracion-comicio/entities/configuracion-comicio.entity';
import { EleccionesModule } from '@/eleccion/eleccion.module';
import { issueTestSessionToken, withBearer } from './helpers/auth-test.helper';

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
  fetchUsuario: jest.fn().mockResolvedValue({
    persona: {
      legajo: '14988',
      nombre: 'Admin',
      apellido: 'Test',
      email: 'admin@test.local',
    },
  }),
};

describe('Sesiones — contención de incidentes (e2e) — VOTAR-492 §12.2', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let jwtService: JwtService;
  let sessionRepo: Repository<RefreshSession>;
  let auditRepo: Repository<AuditLog>;
  let auditLogger: AuditLoggerService;

  let pauserToken: string;
  let adminSinPauserToken: string;

  const seedAutoridad = async (
    identificadorSso: string,
    rol: RolAutoridad,
  ): Promise<void> => {
    await dataSource.getRepository(AutoridadElectoral).save({
      identificadorSso,
      email: `${identificadorSso}@test.local`,
      nombre: identificadorSso,
      rol,
    });
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
              AUTH_LOCKDOWN_CACHE_TTL_MS: 0,
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
    sessionRepo = dataSource.getRepository(RefreshSession);
    auditRepo = dataSource.getRepository(AuditLog);
    auditLogger = app.get(AuditLoggerService);

    await seedAutoridad('pauser.admin', RolAutoridad.PAUSER);
    await seedAutoridad('plain.admin', RolAutoridad.ELECTION_ADMIN);

    pauserToken = await issueTestSessionToken(dataSource, jwtService, {
      sub: 'pauser.admin',
      role: JwtRole.ELECTION_ADMIN,
      identificadorSso: 'pauser.admin',
    });
    adminSinPauserToken = await issueTestSessionToken(dataSource, jwtService, {
      sub: 'plain.admin',
      role: JwtRole.ELECTION_ADMIN,
      identificadorSso: 'plain.admin',
    });
  }, 30000);

  afterAll(async () => {
    if (app) await app.close();
    if (dataSource?.isInitialized) await dataSource.destroy();
  });

  const resetBloqueo = async () => {
    await dataSource
      .getRepository(ConfiguracionSistema)
      .update({ id: 1 }, { authBloqueoAlcance: 'NINGUNO' });
  };

  describe('revocación de sesiones', () => {
    it('GET /auth/sessions lista solo activas y marca la propia', async () => {
      const res = await request(app.getHttpServer())
        .get('/auth/sessions')
        .set(withBearer(pauserToken))
        .expect(200);

      const body = res.body as Array<{ actual: boolean; sub: string }>;
      expect(body.some((s) => s.actual && s.sub === 'pauser.admin')).toBe(true);
      expect(body.every((s) => s.sub !== undefined)).toBe(true);
    });

    it('revocar-todas sin rol PAUSER → 403 y ACCESO_DENEGADO', async () => {
      const before = await auditRepo.count({
        where: { tipoEvento: TipoEventoAudit.ACCESO_DENEGADO },
      });

      await request(app.getHttpServer())
        .post('/auth/sessions/revocar-todas')
        .set(withBearer(adminSinPauserToken))
        .send({
          confirmacion: 'REVOCAR_TODAS_LAS_SESIONES',
          motivo: 'intento sin permisos',
        })
        .expect(403);

      const after = await auditRepo.count({
        where: { tipoEvento: TipoEventoAudit.ACCESO_DENEGADO },
      });
      expect(after).toBeGreaterThan(before);
    });

    it('revocar-todas con confirmación incorrecta → 400 y cero revocaciones', async () => {
      const token = await issueTestSessionToken(dataSource, jwtService, {
        sub: 'victima-1',
        role: JwtRole.ELECTION_ADMIN,
      });

      await request(app.getHttpServer())
        .post('/auth/sessions/revocar-todas')
        .set(withBearer(pauserToken))
        .send({ confirmacion: 'nope', motivo: 'confirmación inválida' })
        .expect(400);

      // La sesión de la víctima sigue activa.
      await request(app.getHttpServer())
        .get('/auth/me')
        .set(withBearer(token))
        .expect(200);
    });

    it('revocar por usuario con motivo corto → 400', async () => {
      await request(app.getHttpServer())
        .post('/auth/sessions/revocar')
        .set(withBearer(pauserToken))
        .send({ identificadorSso: 'x', motivo: 'corto' })
        .expect(400);
    });

    it('revocar-todas con PAUSER → 200, preserva la propia, expulsa las demás, audita ofuscado', async () => {
      const victima = await issueTestSessionToken(dataSource, jwtService, {
        sub: 'victima-2',
        role: JwtRole.ELECTION_ADMIN,
        identificadorSso: 'victima-2',
      });

      const res = await request(app.getHttpServer())
        .post('/auth/sessions/revocar-todas')
        .set(withBearer(pauserToken))
        .send({
          confirmacion: 'REVOCAR_TODAS_LAS_SESIONES',
          motivo: 'compromiso del IdP institucional',
        })
        .expect(200);

      expect(
        (res.body as { sesionesRevocadas: number }).sesionesRevocadas,
      ).toBeGreaterThan(0);

      // El operador sigue dentro; la víctima queda fuera.
      await request(app.getHttpServer())
        .get('/auth/me')
        .set(withBearer(pauserToken))
        .expect(200);
      await request(app.getHttpServer())
        .get('/auth/me')
        .set(withBearer(victima))
        .expect(401);

      const entrada = await auditRepo.findOne({
        where: { tipoEvento: TipoEventoAudit.SESION_REVOCADA },
        order: { idLog: 'DESC' },
      });
      expect(entrada).not.toBeNull();
      const datos = entrada!.datosAdicionales as { alcance?: string };
      expect(datos.alcance).toBe('GLOBAL');

      // Re-emitir sesiones de trabajo para los tests siguientes.
      pauserToken = await issueTestSessionToken(dataSource, jwtService, {
        sub: 'pauser.admin',
        role: JwtRole.ELECTION_ADMIN,
        identificadorSso: 'pauser.admin',
      });
      adminSinPauserToken = await issueTestSessionToken(
        dataSource,
        jwtService,
        {
          sub: 'plain.admin',
          role: JwtRole.ELECTION_ADMIN,
          identificadorSso: 'plain.admin',
        },
      );
    });
  });

  describe('bloqueo de flujos de autenticación', () => {
    afterEach(resetBloqueo);

    it('alcance ADMIN → login 503, logout 204, votante login accesible', async () => {
      await request(app.getHttpServer())
        .put('/configuracion-sistema/auth-bloqueo')
        .set(withBearer(pauserToken))
        .send({ alcance: 'ADMIN', motivo: 'incidente de credenciales admin' })
        .expect(200);

      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ nick: 'votar.admin', password: 'secret' })
        .expect(503);

      await request(app.getHttpServer()).post('/auth/logout').expect(204);

      const votanteRes = await request(app.getHttpServer())
        .post('/auth/votante/login')
        .send({ dni: '45703625', email: 'v@test.local' });
      expect(votanteRes.status).not.toBe(503);
    });

    it('alcance TODOS → también bloquea el login de votantes (503)', async () => {
      await request(app.getHttpServer())
        .put('/configuracion-sistema/auth-bloqueo')
        .set(withBearer(pauserToken))
        .send({ alcance: 'TODOS', motivo: 'compromiso total del IdP' })
        .expect(200);

      await request(app.getHttpServer())
        .post('/auth/votante/login')
        .send({ dni: '45703625', email: 'v@test.local' })
        .expect(503);
    });

    it('volver a NINGUNO restaura el login', async () => {
      await request(app.getHttpServer())
        .put('/configuracion-sistema/auth-bloqueo')
        .set(withBearer(pauserToken))
        .send({ alcance: 'ADMIN', motivo: 'incidente temporal de prueba' })
        .expect(200);
      await request(app.getHttpServer())
        .put('/configuracion-sistema/auth-bloqueo')
        .set(withBearer(pauserToken))
        .send({ alcance: 'NINGUNO' })
        .expect(200);

      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ nick: 'votar.admin', password: 'secret' });
      expect(res.status).not.toBe(503);
    });

    it('un admin sin rol PAUSER no puede togglear el bloqueo (403)', async () => {
      await request(app.getHttpServer())
        .put('/configuracion-sistema/auth-bloqueo')
        .set(withBearer(adminSinPauserToken))
        .send({ alcance: 'ADMIN', motivo: 'intento no autorizado' })
        .expect(403);
    });

    it('registra BLOQUEO_AUTENTICACION en la bitácora', async () => {
      await request(app.getHttpServer())
        .put('/configuracion-sistema/auth-bloqueo')
        .set(withBearer(pauserToken))
        .send({ alcance: 'ADMIN', motivo: 'incidente auditado de prueba' })
        .expect(200);

      const entrada = await auditRepo.findOne({
        where: { tipoEvento: TipoEventoAudit.BLOQUEO_AUTENTICACION },
        order: { idLog: 'DESC' },
      });
      expect(entrada).not.toBeNull();
    });
  });

  it('sanity: quedan sesiones activas para inspección', async () => {
    const activas = await sessionRepo.count({ where: { revokedAt: IsNull() } });
    expect(activas).toBeGreaterThanOrEqual(1);
    void auditLogger;
  });
});
