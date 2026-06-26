import { UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import cookieParser from 'cookie-parser';
import { newDb } from 'pg-mem';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AuditLog } from '@/audit/entities/audit-log.entity';
import { AuthModule } from '@/auth/auth.module';
import { VOTER_ACCESS_COOKIE_NAME } from '@/auth/constants/auth-cookie.constants';
import { VOTANTE_CREDENCIALES_INVALIDAS } from '@/auth/constants/votante-auth.constants';
import { AutoridadElectoral } from '@/auth/entities/autoridad-electoral.entity';
import { RefreshSession } from '@/auth/entities/refresh-session.entity';
import { JwtRole } from '@/auth/enums/jwt-role.enum';
import { AutogestionService } from '@/auth/services/autogestion.service';
import { Candidato } from '@/eleccion/candidato/entities/candidato.entity';
import { CampoDatosCandidato } from '@/eleccion/candidato/entities/campo-datos-candidato.entity';
import { ConfiguracionDatosCandidato } from '@/eleccion/candidato/entities/configuracion-datos-candidato.entity';
import { ConfiguracionComicio } from '@/eleccion/configuracion-comicio/entities/configuracion-comicio.entity';
import { MetodoAutenticacion } from '@/eleccion/configuracion-comicio/enums/metodo-autenticacion.enum';
import { Eleccion } from '@/eleccion/entities/eleccion.entity';
import { EleccionEstado } from '@/eleccion/enums/eleccion-estado.enum';
import { TipoVotacion } from '@/eleccion/enums/tipo-votacion.enum';
import { Boleta } from '@/eleccion/lista/entities/boleta.entity';
import { Categoria } from '@/eleccion/lista/entities/categoria.entity';
import { Lista } from '@/eleccion/lista/entities/lista.entity';
import { PadronEligibilityService } from '@/padron/services/padron-eligibility.service';
import { hashVotante } from '@/padron/utils/keccak.util';
import {
  decodeJwtPayload,
  extractVoterAccessToken,
} from './helpers/voter-auth-test.helper';

const TEST_DNI = '45703625';
const TEST_EMAIL = 'votante.uat@test.local';
const TEST_VOTANTE_HASH = hashVotante(TEST_DNI, TEST_EMAIL);
const TEST_ID_ELECCION = 1;

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
  AuditLog,
];

type AutogestionMock = {
  login: jest.Mock;
  fetchUsuario: jest.Mock;
};

const buildAutogestionMock = (): AutogestionMock => ({
  login: jest.fn().mockResolvedValue('autogestion-hash'),
  fetchUsuario: jest.fn().mockResolvedValue({
    persona: {
      nombre: 'Votante',
      apellido: 'UAT',
      documento: Number(TEST_DNI),
      email: TEST_EMAIL,
      alumno: { legajo: '14988' },
    },
  }),
});

const seedVoterFixtures = async (dataSource: DataSource): Promise<void> => {
  const eleccionRepo = dataSource.getRepository(Eleccion);
  const configuracionRepo = dataSource.getRepository(ConfiguracionComicio);

  const eleccion = await eleccionRepo.save(
    eleccionRepo.create({
      nombre: 'Comicio UAT Votante',
      descripcion: null,
      fechaInicio: new Date(Date.now() + 86400000),
      fechaFin: new Date(Date.now() + 172800000),
      estado: EleccionEstado.CONFIGURADA,
      tipoVotacion: TipoVotacion.POR_LISTA,
      minimoCandidatosPorLista: null,
    }),
  );

  await configuracionRepo.save(
    configuracionRepo.create({
      eleccion,
      permitirVotoEnBlanco: false,
      permitirVotoMultiple: false,
      maxVotosPorVotante: 1,
      minIntervaloSegundos: 0,
      mostrarResultadosTiempoReal: false,
      duracionMinutos: null,
      metodosAutenticacion: [MetodoAutenticacion.SSO_INSTITUCIONAL],
    }),
  );
};

const buildPadronEligibilityMock = () => ({
  isVotanteHabilitado: jest
    .fn()
    .mockImplementation(
      (_idEleccion: number, votanteHash: string): Promise<boolean> =>
        Promise.resolve(votanteHash === TEST_VOTANTE_HASH),
    ),
});

const createVoterAuthApp = async (
  voterTtl: string,
): Promise<{
  app: INestApplication<App>;
  dataSource: DataSource;
  autogestionService: AutogestionMock;
}> => {
  const autogestionService = buildAutogestionMock();
  const db = newDb({ autoCreateForeignKeyIndices: true });
  db.public.registerFunction({
    name: 'current_database',
    implementation: () => 'test',
  });
  db.public.registerFunction({
    name: 'version',
    implementation: () => 'PostgreSQL 16.0',
  });

  let dataSource!: DataSource;

  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
        load: [
          () => ({
            JWT_SECRET: 'test-secret-for-e2e-tests-min-16',
            JWT_ACCESS_EXPIRES_IN: '15m',
            JWT_VOTER_ACCESS_EXPIRES_IN: voterTtl,
            JWT_REFRESH_EXPIRES_IN: '8h',
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
    ],
  })
    .overrideProvider(AutogestionService)
    .useValue(autogestionService)
    .overrideProvider(PadronEligibilityService)
    .useValue(buildPadronEligibilityMock())
    .compile();

  const app = moduleFixture.createNestApplication();
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  await app.init();
  await seedVoterFixtures(dataSource);

  return { app, dataSource, autogestionService };
};

describe('VotanteAuth (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let autogestionService: AutogestionMock;

  beforeAll(async () => {
    const context = await createVoterAuthApp('30m');
    app = context.app;
    dataSource = context.dataSource;
    autogestionService = context.autogestionService;
  }, 30000);

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }
  });

  it('UAT-01: login exitoso emite cookie HttpOnly con JWT role=voter', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/votante/login')
      .send({
        nick: '14988',
        password: 'secret',
        idEleccion: TEST_ID_ELECCION,
      })
      .expect(200);

    expect(response.body.user).toMatchObject({
      sub: '14988',
      role: JwtRole.VOTER,
      idEleccion: TEST_ID_ELECCION,
    });
    expect(response.body.accessToken).toBeUndefined();

    const token = extractVoterAccessToken(response.headers['set-cookie']);
    expect(token).toBeDefined();

    const payload = decodeJwtPayload(token as string);
    expect(payload.role).toBe(JwtRole.VOTER);
    expect(payload.votanteHash).toBe(TEST_VOTANTE_HASH);
    expect(payload.idEleccion).toBe(TEST_ID_ELECCION);

    const cookieHeader = response.headers['set-cookie'] as string[];
    expect(
      cookieHeader.some((value) =>
        value.includes(`${VOTER_ACCESS_COOKIE_NAME}=`),
      ),
    ).toBe(true);
    expect(cookieHeader.some((value) => value.includes('HttpOnly'))).toBe(true);
  });

  it('UAT-02: credenciales inválidas responden 401 genérico sin PII', async () => {
    autogestionService.login.mockRejectedValueOnce(
      new UnauthorizedException(VOTANTE_CREDENCIALES_INVALIDAS),
    );

    const response = await request(app.getHttpServer())
      .post('/auth/votante/login')
      .send({
        nick: '14988',
        password: 'wrong-password',
        idEleccion: TEST_ID_ELECCION,
      })
      .expect(401);

    expect(response.body.message).toBe(VOTANTE_CREDENCIALES_INVALIDAS);
    expect(JSON.stringify(response.body)).not.toContain(TEST_EMAIL);
    expect(JSON.stringify(response.body)).not.toContain(TEST_DNI);
    expect(JSON.stringify(response.body)).not.toContain('bloqueada');
  });

  it('GET /auth/votante/me valida la cookie de votante autenticado', async () => {
    const loginResponse = await request(app.getHttpServer())
      .post('/auth/votante/login')
      .send({
        nick: '14988',
        password: 'secret',
        idEleccion: TEST_ID_ELECCION,
      })
      .expect(200);

    const token = extractVoterAccessToken(loginResponse.headers['set-cookie']);

    const meResponse = await request(app.getHttpServer())
      .get('/auth/votante/me')
      .set('Cookie', `${VOTER_ACCESS_COOKIE_NAME}=${token}`)
      .expect(200);

    expect(meResponse.body).toMatchObject({
      sub: '14988',
      role: JwtRole.VOTER,
      idEleccion: TEST_ID_ELECCION,
    });
  });

  it('UAT-04: no existe endpoint de refresh para votante', async () => {
    await request(app.getHttpServer())
      .post('/auth/votante/refresh')
      .expect(404);
  });
});

describe('VotanteAuth expiration (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;

  beforeAll(async () => {
    const context = await createVoterAuthApp('1s');
    app = context.app;
    dataSource = context.dataSource;
  }, 30000);

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }
  });

  it('UAT-03: token expirado rechaza /auth/votante/me con 401', async () => {
    const loginResponse = await request(app.getHttpServer())
      .post('/auth/votante/login')
      .send({
        nick: '14988',
        password: 'secret',
        idEleccion: TEST_ID_ELECCION,
      })
      .expect(200);

    const token = extractVoterAccessToken(loginResponse.headers['set-cookie']);

    await new Promise((resolve) => setTimeout(resolve, 1500));

    await request(app.getHttpServer())
      .get('/auth/votante/me')
      .set('Cookie', `${VOTER_ACCESS_COOKIE_NAME}=${token}`)
      .expect(401);
  }, 10000);
});
