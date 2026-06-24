import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { newDb } from 'pg-mem';
import { DataSource, Repository } from 'typeorm';
import { AuditLog } from '@/audit/entities/audit-log.entity';
import { TipoEventoAudit } from '@/audit/enums/tipo-evento-audit.enum';
import { AuthModule } from '@/auth/auth.module';
import { AutoridadElectoral } from '@/auth/entities/autoridad-electoral.entity';
import { JwtRole } from '@/auth/enums/jwt-role.enum';
import { RolAutoridad } from '@/auth/enums/rol-autoridad.enum';
import { AutogestionService } from '@/auth/services/autogestion.service';
import { EleccionesModule } from '@/eleccion/eleccion.module';
import { Eleccion } from '@/eleccion/entities/eleccion.entity';
import { Boleta } from '@/eleccion/lista/entities/boleta.entity';
import { Categoria } from '@/eleccion/lista/entities/categoria.entity';
import { Lista } from '@/eleccion/lista/entities/lista.entity';
import { Candidato } from '@/eleccion/candidato/entities/candidato.entity';
import { ConfiguracionDatosCandidato } from '@/eleccion/candidato/entities/configuracion-datos-candidato.entity';
import { CampoDatosCandidato } from '@/eleccion/candidato/entities/campo-datos-candidato.entity';
import { ConfiguracionComicio } from '@/eleccion/configuracion-comicio/entities/configuracion-comicio.entity';
import { withBearer } from './helpers/auth-test.helper';

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
  let auditLogRepository: Repository<AuditLog>;
  let adminToken: string;
  let voterToken: string;

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
              JWT_EXPIRES_IN: '8h',
              AUTOGESTION_BASE_URL: 'https://autogestion.test',
              AUTOGESTION_USER_AGENT: 'test',
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
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    jwtService = app.get(JwtService);
    adminToken = jwtService.sign({
      sub: '14988',
      role: JwtRole.ELECTION_ADMIN,
      email: 'admin@test.local',
    });
    voterToken = jwtService.sign({
      sub: '15079',
      role: JwtRole.VOTER,
      email: 'voter@test.local',
    });

    const autoridadRepository = dataSource.getRepository(AutoridadElectoral);
    await autoridadRepository.save({
      identificadorSso: 'votar.admin',
      emailInstitucional: 'admin@test.local',
      nombre: 'Admin Test',
      rol: RolAutoridad.ELECTION_ADMIN,
    });

    auditLogRepository = dataSource.getRepository(AuditLog);
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
    expect(latest.actor).toBe('15079');
    expect(latest.endpoint).toBe('GET /elecciones');
    expect(latest.ipOrigen).toBeDefined();
    expect(latest.timestamp).toBeDefined();
  });

  it('POST /auth/login emite JWT con role election_admin para autoridad registrada', async () => {
    mockAutogestionService.fetchUsuario.mockResolvedValueOnce({
      persona: {
        legajo: '14988',
        nombre: 'Admin',
        apellido: 'Test',
        email: 'admin@test.local',
      },
    });

    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ nick: 'votar.admin', password: 'secret' })
      .expect(200);

    const body = response.body as {
      accessToken: string;
      user: { role: string; sub: string };
    };
    expect(body.accessToken).toBeDefined();
    expect(body.user.role).toBe(JwtRole.ELECTION_ADMIN);

    const decoded = jwtService.decode(body.accessToken);
    expect(decoded.role).toBe(JwtRole.ELECTION_ADMIN);
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
