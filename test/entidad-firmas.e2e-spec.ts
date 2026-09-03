import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import cookieParser from 'cookie-parser';
import { keccak256, recoverAddress, TypedDataEncoder, Wallet } from 'ethers';
import { newDb } from 'pg-mem';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AuditLog } from '@/audit/entities/audit-log.entity';
import { AuthModule } from '@/auth/auth.module';
import { VOTER_ACCESS_COOKIE_NAME } from '@/auth/constants/auth-cookie.constants';
import { AutoridadElectoral } from '@/auth/entities/autoridad-electoral.entity';
import { RefreshSession } from '@/auth/entities/refresh-session.entity';
import { JwtRole } from '@/auth/enums/jwt-role.enum';
import { AutogestionService } from '@/auth/services/autogestion.service';
import { BlockchainService } from '@/blockchain/blockchain.service';
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
import { CredencialValidacion } from '@/entidad-firmas/entities/credencial-validacion.entity';
import { EmisionCredencial } from '@/entidad-firmas/entities/emision-credencial.entity';
import { EntidadFirmasModule } from '@/entidad-firmas/entidad-firmas.module';
import { MerkleTree } from '@/padron/entities/merkle-tree.entity';
import { PadronElectoral } from '@/padron/entities/padron-electoral.entity';
import { PadronVotante } from '@/padron/entities/padron-votante.entity';
import { extractVoterAccessToken } from './helpers/voter-auth-test.helper';
import {
  createAuthedRequest,
  type AuthedRequest,
} from './helpers/auth-test.helper';

const VOTER_DNI = '30222333';
const VOTER_EMAIL = 'bruno@frvm.utn.edu.ar';

const CSV_PADRON = `dni,email
30111222,ana@frvm.utn.edu.ar
30222333,bruno@frvm.utn.edu.ar`;

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
  CredencialValidacion,
  EmisionCredencial,
];

const VALIDATOR_WALLET = Wallet.createRandom();
const BALLOT_ADDRESS = '0x0000000000000000000000000000000000000abc';
const CHAIN_ID = 11155111;

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

describe('EntidadFirmasDigitales (e2e) — VOTAR-377', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let adminReq: AuthedRequest;
  let idEleccion: number;
  let voterCookie: string;

  const validPayload = {
    nullifier: `0x${'2'.repeat(64)}`,
    selectionHash: `0x${'3'.repeat(64)}`,
    candidateId: '101',
    timestamp: 1_700_000_000,
    expectedSigner: '0x1234abcd1234abcd1234abcd1234abcd1234abcd',
  };

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
    const uuid = () => {
      uuidCounter += 1;
      return `00000000-0000-4000-8000-${String(uuidCounter).padStart(12, '0')}`;
    };
    db.public.registerFunction({
      name: 'uuid_generate_v4',
      implementation: uuid,
      impure: true,
    });
    db.public.registerFunction({
      name: 'gen_random_uuid',
      implementation: uuid,
      impure: true,
    });

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [
            () => ({
              JWT_SECRET: 'test-secret-for-e2e-tests-min-16',
              JWT_VOTER_ACCESS_EXPIRES_IN: '30m',
              DEVELOPMENT: true,
              VALIDATOR_PRIVATE_KEY: VALIDATOR_WALLET.privateKey,
              CREDENCIAL_VALIDACION_TTL_MS: 900_000,
              CHAIN_ID,
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
        EntidadFirmasModule,
      ],
    })
      .overrideProvider(AutogestionService)
      .useValue(buildAutogestionMock())
      .overrideProvider(BlockchainService)
      .useValue({
        resolveElectionContracts: jest.fn().mockResolvedValue({
          ballot: BALLOT_ADDRESS,
          voteRegistry: '0x0000000000000000000000000000000000000002',
          auditView: '0x0000000000000000000000000000000000000003',
        }),
        getChainId: jest.fn(() => CHAIN_ID),
      })
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

    const adminToken = app
      .get(JwtService)
      .sign({ sub: '14988', role: JwtRole.ELECTION_ADMIN });
    adminReq = createAuthedRequest(app, adminToken);

    const createResponse = await adminReq
      .post('/elecciones')
      .send({
        nombre: 'Comicio E2E VOTAR-377',
        fechaInicio: new Date(Date.now() + 86400000).toISOString(),
        fechaFin: new Date(Date.now() + 172800000).toISOString(),
        tipoVotacion: TipoVotacion.POR_LISTA,
        metodosAutenticacion: [MetodoAutenticacion.SSO_INSTITUCIONAL],
      })
      .expect(201);
    idEleccion = createResponse.body.idEleccion as number;

    await adminReq
      .post(`/elecciones/${idEleccion}/padron/import`)
      .attach('file', Buffer.from(CSV_PADRON, 'utf-8'), 'padron.csv')
      .expect(201);

    const loginResponse = await request(app.getHttpServer())
      .post('/auth/votante/login')
      .send({ nick: '14988', password: 'secret', idEleccion })
      .expect(200);
    voterCookie = `${VOTER_ACCESS_COOKIE_NAME}=${extractVoterAccessToken(
      loginResponse.headers['set-cookie'],
    )}`;

    // El comicio debe estar ABIERTA para emitir credenciales.
    await dataSource
      .getRepository(Eleccion)
      .update({ idEleccion }, { estado: EleccionEstado.ABIERTA });
  }, 60000);

  afterAll(async () => {
    if (app) await app.close();
    if (dataSource?.isInitialized) await dataSource.destroy();
  });

  const emitirCredencial = (secreto: string) =>
    request(app.getHttpServer())
      .post(`/elecciones/${idEleccion}/validacion/credencial`)
      .set('Cookie', voterCookie)
      .send({ commit: keccak256(secreto) });

  it('FASE 1 exige JWT de votante', async () => {
    await request(app.getHttpServer())
      .post(`/elecciones/${idEleccion}/validacion/credencial`)
      .send({ commit: `0x${'a'.repeat(64)}` })
      .expect(401);
  });

  it('FASE 1 emite una credencial para un votante del padrón', async () => {
    const secreto = `0x${'1'.repeat(64)}`;
    const res = await emitirCredencial(secreto).expect(201);
    expect(typeof res.body.expiraEn).toBe('string');
  });

  it('FASE 2 firma el sufragio de forma anónima (sin cookie) y la firma recupera al validador', async () => {
    const secreto = `0x${'4'.repeat(64)}`;
    await emitirCredencial(secreto).expect(201);

    const res = await request(app.getHttpServer())
      .post(`/validacion/elecciones/${idEleccion}/firma`)
      .send({ secreto, ...validPayload })
      .expect(201);

    expect(res.body.direccionValidador).toBe(VALIDATOR_WALLET.address);

    const digest = TypedDataEncoder.hash(
      {
        name: 'VOTAR',
        version: '1',
        chainId: CHAIN_ID,
        verifyingContract: BALLOT_ADDRESS,
      },
      {
        Validation: [
          { name: 'electionId', type: 'uint256' },
          { name: 'nullifier', type: 'bytes32' },
          { name: 'selectionHash', type: 'bytes32' },
          { name: 'candidateId', type: 'uint256' },
          { name: 'timestamp', type: 'uint256' },
          { name: 'expectedSigner', type: 'address' },
        ],
      },
      {
        electionId: BigInt(idEleccion),
        nullifier: validPayload.nullifier,
        selectionHash: validPayload.selectionHash,
        candidateId: BigInt(validPayload.candidateId),
        timestamp: BigInt(validPayload.timestamp),
        expectedSigner: validPayload.expectedSigner,
      },
    );
    expect(recoverAddress(digest, res.body.firmaValidacion)).toBe(
      VALIDATOR_WALLET.address,
    );
  });

  it('FASE 2 rechaza el segundo uso del mismo secreto (uso único)', async () => {
    const secreto = `0x${'5'.repeat(64)}`;
    await emitirCredencial(secreto).expect(201);

    await request(app.getHttpServer())
      .post(`/validacion/elecciones/${idEleccion}/firma`)
      .send({ secreto, ...validPayload })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/validacion/elecciones/${idEleccion}/firma`)
      .send({ secreto, ...validPayload })
      .expect(410);
  });

  it('FASE 2 rechaza un secreto que nunca fue emitido', async () => {
    await request(app.getHttpServer())
      .post(`/validacion/elecciones/${idEleccion}/firma`)
      .send({ secreto: `0x${'9'.repeat(64)}`, ...validPayload })
      .expect(410);
  });
});
