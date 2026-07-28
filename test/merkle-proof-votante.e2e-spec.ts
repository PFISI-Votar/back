import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StandardMerkleTree } from '@openzeppelin/merkle-tree';
import cookieParser from 'cookie-parser';
import { newDb } from 'pg-mem';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AuditLog } from '@/audit/entities/audit-log.entity';
import { AuthModule } from '@/auth/auth.module';
import { BlockchainService } from '@/blockchain/blockchain.service';
import { VOTER_ACCESS_COOKIE_NAME } from '@/auth/constants/auth-cookie.constants';
import { AutoridadElectoral } from '@/auth/entities/autoridad-electoral.entity';
import { RefreshSession } from '@/auth/entities/refresh-session.entity';
import { JwtRole } from '@/auth/enums/jwt-role.enum';
import { AutogestionService } from '@/auth/services/autogestion.service';
import { Candidato } from '@/eleccion/candidato/entities/candidato.entity';
import { CampoDatosCandidato } from '@/eleccion/candidato/entities/campo-datos-candidato.entity';
import { ConfiguracionDatosCandidato } from '@/eleccion/candidato/entities/configuracion-datos-candidato.entity';
import { ConfiguracionComicio } from '@/eleccion/configuracion-comicio/entities/configuracion-comicio.entity';
import { MetodoAutenticacion } from '@/eleccion/configuracion-comicio/enums/metodo-autenticacion.enum';
import { EleccionesModule } from '@/eleccion/eleccion.module';
import { Eleccion } from '@/eleccion/entities/eleccion.entity';
import { EleccionEstado } from '@/eleccion/enums/eleccion-estado.enum';
import { TipoVotacion } from '@/eleccion/enums/tipo-votacion.enum';
import { Boleta } from '@/eleccion/lista/entities/boleta.entity';
import { Categoria } from '@/eleccion/lista/entities/categoria.entity';
import { Lista } from '@/eleccion/lista/entities/lista.entity';
import { MerkleTree } from '@/padron/entities/merkle-tree.entity';
import { PadronElectoral } from '@/padron/entities/padron-electoral.entity';
import { PadronVotante } from '@/padron/entities/padron-votante.entity';
import { hashVotante } from '@/padron/utils/keccak.util';
import { VotoModule } from '@/voto/voto.module';
import {
  createAuthedRequest,
  type AuthedRequest,
} from './helpers/auth-test.helper';
import { extractVoterAccessToken } from './helpers/voter-auth-test.helper';

const VOTER_DNI = '30222333';
const VOTER_EMAIL = 'bruno@frvm.utn.edu.ar';
const VOTER_HASH = hashVotante(VOTER_DNI, VOTER_EMAIL);

const CSV_PADRON = `dni,email
30111222,ana@frvm.utn.edu.ar
30222333,bruno@frvm.utn.edu.ar
30333444,carla@frvm.utn.edu.ar
30444555,diego@frvm.utn.edu.ar`;

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
  PadronElectoral,
  PadronVotante,
  MerkleTree,
];

const buildEleccionPayload = () => ({
  nombre: 'Comicio E2E Merkle Proof Votante',
  fechaInicio: new Date(Date.now() + 86400000).toISOString(),
  fechaFin: new Date(Date.now() + 172800000).toISOString(),
  tipoVotacion: TipoVotacion.POR_LISTA,
  metodosAutenticacion: [MetodoAutenticacion.SSO_INSTITUCIONAL],
});

const MOCK_BALLOT_CONTRACT_ADDRESS =
  '0x0000000000000000000000000000000000000001';

const buildBlockchainServiceMock = () => ({
  resolveElectionContracts: jest.fn().mockResolvedValue({
    ballot: MOCK_BALLOT_CONTRACT_ADDRESS,
    voteRegistry: '0x0000000000000000000000000000000000000002',
    auditView: '0x0000000000000000000000000000000000000003',
  }),
});

const buildAutogestionMock = () => ({
  login: jest.fn().mockResolvedValue('autogestion-hash'),
  fetchUsuario: jest.fn().mockResolvedValue({
    persona: {
      nombre: 'Bruno',
      apellido: 'Test',
      documento: Number(VOTER_DNI),
      email: VOTER_EMAIL,
      alumno: { legajo: '14988' },
    },
  }),
});

describe('MerkleProofVotante (e2e) — VOTAR-354', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let adminReq: AuthedRequest;
  let idEleccion: number;
  let voterCookie: string;

  beforeAll(async () => {
    const db = newDb({ autoCreateForeignKeyIndices: true });
    let uuidCounter = 0;
    db.public.registerFunction({
      name: 'current_database',
      implementation: () => 'test',
    });
    db.public.registerFunction({
      name: 'version',
      implementation: () => 'PostgreSQL 16.0',
    });
    db.public.registerFunction({
      name: 'uuid_generate_v4',
      implementation: () => {
        uuidCounter += 1;
        return `00000000-0000-4000-8000-${String(uuidCounter).padStart(12, '0')}`;
      },
    });

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [
            () => ({
              JWT_SECRET: 'test-secret-for-e2e-tests-min-16',
              JWT_ACCESS_EXPIRES_IN: '15m',
              JWT_VOTER_ACCESS_EXPIRES_IN: '30m',
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
        EleccionesModule,
        VotoModule,
      ],
    })
      .overrideProvider(AutogestionService)
      .useValue(buildAutogestionMock())
      .overrideProvider(BlockchainService)
      .useValue(buildBlockchainServiceMock())
      .compile();

    app = moduleFixture.createNestApplication();
    app.set('trust proxy', 1);
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    const adminToken = app.get(JwtService).sign({
      sub: '14988',
      role: JwtRole.ELECTION_ADMIN,
    });
    adminReq = createAuthedRequest(app, adminToken);

    const createResponse = await adminReq
      .post('/elecciones')
      .send(buildEleccionPayload())
      .expect(201);
    idEleccion = createResponse.body.idEleccion as number;

    await adminReq
      .post(`/elecciones/${idEleccion}/padron/import`)
      .attach('file', Buffer.from(CSV_PADRON, 'utf-8'), 'padron.csv')
      .expect(201);

    await dataSource
      .getRepository(Eleccion)
      .update({ idEleccion }, { estado: EleccionEstado.CONFIGURADA });

    const loginResponse = await request(app.getHttpServer())
      .post('/auth/votante/login')
      .send({
        nick: '14988',
        password: 'secret',
        idEleccion,
      })
      .expect(200);

    const token = extractVoterAccessToken(loginResponse.headers['set-cookie']);
    voterCookie = `${VOTER_ACCESS_COOKIE_NAME}=${token}`;
  }, 60000);

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }
  });

  it('UAT-01: votante autenticado recibe merkleProof y root verificables', async () => {
    const response = await request(app.getHttpServer())
      .get(`/elecciones/${idEleccion}/merkle-proof`)
      .set('Cookie', voterCookie)
      .expect(200);

    const { hashHoja, merkleProof, root, ballotContractAddress } =
      response.body as {
        hashHoja: string;
        merkleProof: string[];
        root: string;
        ballotContractAddress: string;
      };

    expect(hashHoja).toBe(VOTER_HASH);
    expect(Array.isArray(merkleProof)).toBe(true);
    expect(merkleProof.length).toBeGreaterThan(0);
    expect(root).toMatch(/^0x[0-9a-f]{64}$/);
    expect(ballotContractAddress).toBe(MOCK_BALLOT_CONTRACT_ADDRESS);

    const isValid = StandardMerkleTree.verify(
      root,
      ['bytes32'],
      [`0x${VOTER_HASH}`],
      merkleProof,
    );
    expect(isValid).toBe(true);
  });

  it('rechaza solicitud sin JWT con 401', async () => {
    await request(app.getHttpServer())
      .get(`/elecciones/${idEleccion}/merkle-proof`)
      .expect(401);
  });

  it('UAT-03: votante autenticado no empadronado recibe 403', async () => {
    const jwtService = app.get(JwtService);
    const foreignHash = 'f'.repeat(64);
    const token = jwtService.sign({
      sub: '99999',
      role: JwtRole.VOTER,
      votanteHash: foreignHash,
      idEleccion,
    });

    const response = await request(app.getHttpServer())
      .get(`/elecciones/${idEleccion}/merkle-proof`)
      .set('Cookie', `${VOTER_ACCESS_COOKIE_NAME}=${token}`)
      .expect(403);

    expect(response.body.message).toBe(
      'No te encuentras habilitado en el padrón',
    );
  });

  it('rechaza JWT con idEleccion distinto al de la ruta con 403', async () => {
    const jwtService = app.get(JwtService);
    const token = jwtService.sign({
      sub: '14988',
      role: JwtRole.VOTER,
      votanteHash: VOTER_HASH,
      idEleccion: idEleccion + 999,
    });

    await request(app.getHttpServer())
      .get(`/elecciones/${idEleccion}/merkle-proof`)
      .set('Cookie', `${VOTER_ACCESS_COOKIE_NAME}=${token}`)
      .expect(403);
  });
});

describe('MerkleProofVotante rate limit (e2e) — VOTAR-354', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let idEleccion: number;
  let voterCookie: string;

  beforeAll(async () => {
    const db = newDb({ autoCreateForeignKeyIndices: true });
    let uuidCounter = 0;
    db.public.registerFunction({
      name: 'current_database',
      implementation: () => 'test',
    });
    db.public.registerFunction({
      name: 'version',
      implementation: () => 'PostgreSQL 16.0',
    });
    db.public.registerFunction({
      name: 'uuid_generate_v4',
      implementation: () => {
        uuidCounter += 1;
        return `00000000-0000-4000-8000-${String(uuidCounter).padStart(12, '0')}`;
      },
    });

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [
            () => ({
              JWT_SECRET: 'test-secret-for-e2e-tests-min-16',
              JWT_ACCESS_EXPIRES_IN: '15m',
              JWT_VOTER_ACCESS_EXPIRES_IN: '30m',
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
        EleccionesModule,
        VotoModule,
      ],
    })
      .overrideProvider(AutogestionService)
      .useValue(buildAutogestionMock())
      .overrideProvider(BlockchainService)
      .useValue(buildBlockchainServiceMock())
      .compile();

    app = moduleFixture.createNestApplication();
    app.set('trust proxy', 1);
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    const adminToken = app.get(JwtService).sign({
      sub: '14988',
      role: JwtRole.ELECTION_ADMIN,
    });
    const adminReq = createAuthedRequest(app, adminToken);

    const createResponse = await adminReq
      .post('/elecciones')
      .send(buildEleccionPayload())
      .expect(201);
    idEleccion = createResponse.body.idEleccion as number;

    await adminReq
      .post(`/elecciones/${idEleccion}/padron/import`)
      .attach('file', Buffer.from(CSV_PADRON, 'utf-8'), 'padron.csv')
      .expect(201);

    const loginResponse = await request(app.getHttpServer())
      .post('/auth/votante/login')
      .send({
        nick: '14988',
        password: 'secret',
        idEleccion,
      })
      .expect(200);

    const token = extractVoterAccessToken(loginResponse.headers['set-cookie']);
    voterCookie = `${VOTER_ACCESS_COOKIE_NAME}=${token}`;
  }, 60000);

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }
  });

  it('aplica rate limit de 5 solicitudes por IP por minuto', async () => {
    for (let i = 0; i < 5; i++) {
      await request(app.getHttpServer())
        .get(`/elecciones/${idEleccion}/merkle-proof`)
        .set('Cookie', voterCookie)
        .expect(200);
    }

    await request(app.getHttpServer())
      .get(`/elecciones/${idEleccion}/merkle-proof`)
      .set('Cookie', voterCookie)
      .expect(429);
  });
});

describe('MerkleProofVotante expiration (e2e) — VOTAR-354 UAT-02', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let idEleccion: number;

  beforeAll(async () => {
    const db = newDb({ autoCreateForeignKeyIndices: true });
    let uuidCounter = 0;
    db.public.registerFunction({
      name: 'current_database',
      implementation: () => 'test',
    });
    db.public.registerFunction({
      name: 'version',
      implementation: () => 'PostgreSQL 16.0',
    });
    db.public.registerFunction({
      name: 'uuid_generate_v4',
      implementation: () => {
        uuidCounter += 1;
        return `00000000-0000-4000-8000-${String(uuidCounter).padStart(12, '0')}`;
      },
    });

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [
            () => ({
              JWT_SECRET: 'test-secret-for-e2e-tests-min-16',
              JWT_ACCESS_EXPIRES_IN: '15m',
              JWT_VOTER_ACCESS_EXPIRES_IN: '1s',
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
        EleccionesModule,
        VotoModule,
      ],
    })
      .overrideProvider(AutogestionService)
      .useValue(buildAutogestionMock())
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

    const adminToken = app.get(JwtService).sign({
      sub: '14988',
      role: JwtRole.ELECTION_ADMIN,
    });
    const adminReq = createAuthedRequest(app, adminToken);

    const createResponse = await adminReq
      .post('/elecciones')
      .send(buildEleccionPayload())
      .expect(201);
    idEleccion = createResponse.body.idEleccion as number;

    await adminReq
      .post(`/elecciones/${idEleccion}/padron/import`)
      .attach('file', Buffer.from(CSV_PADRON, 'utf-8'), 'padron.csv')
      .expect(201);
  }, 60000);

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }
  });

  it('UAT-02: JWT expirado rechaza merkle-proof con 401', async () => {
    const loginResponse = await request(app.getHttpServer())
      .post('/auth/votante/login')
      .send({
        nick: '14988',
        password: 'secret',
        idEleccion,
      })
      .expect(200);

    const token = extractVoterAccessToken(loginResponse.headers['set-cookie']);
    await new Promise((resolve) => setTimeout(resolve, 1500));

    await request(app.getHttpServer())
      .get(`/elecciones/${idEleccion}/merkle-proof`)
      .set('Cookie', `${VOTER_ACCESS_COOKIE_NAME}=${token}`)
      .expect(401);
  }, 10000);
});
