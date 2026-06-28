import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StandardMerkleTree } from '@openzeppelin/merkle-tree';
import { App } from 'supertest/types';
import { newDb } from 'pg-mem';
import { DataSource } from 'typeorm';
import { AuditLog } from '@/audit/entities/audit-log.entity';
import { AuthModule } from '@/auth/auth.module';
import { AutoridadElectoral } from '@/auth/entities/autoridad-electoral.entity';
import { RefreshSession } from '@/auth/entities/refresh-session.entity';
import { JwtRole } from '@/auth/enums/jwt-role.enum';
import { EleccionesModule } from '@/eleccion/eleccion.module';
import { Candidato } from '@/eleccion/candidato/entities/candidato.entity';
import { CampoDatosCandidato } from '@/eleccion/candidato/entities/campo-datos-candidato.entity';
import { ConfiguracionDatosCandidato } from '@/eleccion/candidato/entities/configuracion-datos-candidato.entity';
import { ConfiguracionComicio } from '@/eleccion/configuracion-comicio/entities/configuracion-comicio.entity';
import { MetodoAutenticacion } from '@/eleccion/configuracion-comicio/enums/metodo-autenticacion.enum';
import { Eleccion } from '@/eleccion/entities/eleccion.entity';
import { TipoVotacion } from '@/eleccion/enums/tipo-votacion.enum';
import { Boleta } from '@/eleccion/lista/entities/boleta.entity';
import { Categoria } from '@/eleccion/lista/entities/categoria.entity';
import { Lista } from '@/eleccion/lista/entities/lista.entity';
import { MerkleTree } from '@/padron/entities/merkle-tree.entity';
import { PadronElectoral } from '@/padron/entities/padron-electoral.entity';
import { PadronVotante } from '@/padron/entities/padron-votante.entity';
import { MerkleTreeEstado } from '@/padron/enums/merkle-tree-estado.enum';
import {
  createAuthedRequest,
  type AuthedRequest,
} from './helpers/auth-test.helper';

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

const CSV_PADRON = `dni,email
30111222,ana@frvm.utn.edu.ar
30222333,bruno@frvm.utn.edu.ar
30333444,carla@frvm.utn.edu.ar
30444555,diego@frvm.utn.edu.ar`;

const buildEleccionPayload = () => ({
  nombre: 'Comicio E2E Merkle',
  fechaInicio: new Date(Date.now() + 86400000).toISOString(),
  fechaFin: new Date(Date.now() + 172800000).toISOString(),
  tipoVotacion: TipoVotacion.POR_LISTA,
  metodosAutenticacion: [MetodoAutenticacion.SSO_INSTITUCIONAL],
});

describe('PadronMerkle (e2e) — VOTAR-334', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let req: AuthedRequest;
  let idEleccion: number;

  const importarPadron = async (): Promise<void> => {
    await req
      .post(`/elecciones/${idEleccion}/padron/import`)
      .attach('file', Buffer.from(CSV_PADRON, 'utf-8'), 'padron.csv')
      .expect(201);
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
              JWT_REFRESH_EXPIRES_IN: '8h',
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
    }).compile();

    app = moduleFixture.createNestApplication();
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
    req = createAuthedRequest(app, adminToken);

    const createResponse = await req
      .post('/elecciones')
      .send(buildEleccionPayload())
      .expect(201);
    idEleccion = createResponse.body.idEleccion as number;
  }, 30000);

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }
  });

  it('UAT-01: importar el mismo CSV dos veces produce el mismo sello Merkle', async () => {
    await importarPadron();

    const firstResumen = await req
      .get(`/elecciones/${idEleccion}/padron`)
      .expect(200);
    const firstHash = firstResumen.body.hashPadron as string;

    await req.delete(`/elecciones/${idEleccion}/padron`).expect(204);
    await importarPadron();

    const secondResumen = await req
      .get(`/elecciones/${idEleccion}/padron`)
      .expect(200);

    expect(secondResumen.body.hashPadron).toBe(firstHash);
  });

  it('GET /padron/merkle devuelve la raíz consolidada', async () => {
    const response = await req
      .get(`/elecciones/${idEleccion}/padron/merkle`)
      .expect(200);

    expect(response.body.merkleRoot).toMatch(/^0x[0-9a-f]{64}$/);
    expect(response.body.totalHojas).toBe(4);
    expect(response.body.estado).toBe(MerkleTreeEstado.GENERADO);
  });

  it('UAT-02: la proof de una hoja reconstruye la raíz Merkle del comicio', async () => {
    const votantesResponse = await req
      .get(`/elecciones/${idEleccion}/padron/votantes?page=1&limit=10`)
      .expect(200);
    const targetHash = votantesResponse.body.items[1].hashHoja as string;

    const proofResponse = await req
      .get(`/elecciones/${idEleccion}/padron/votantes/${targetHash}/proof`)
      .expect(200);

    const { merkleRoot, merkleProof } = proofResponse.body as {
      merkleRoot: string;
      merkleProof: string[];
    };

    const isValid = StandardMerkleTree.verify(
      merkleRoot,
      ['bytes32'],
      [`0x${targetHash}`],
      merkleProof,
    );

    expect(isValid).toBe(true);
  });

  it('GET /padron/votantes/:hashHoja/proof retorna 404 para hoja inexistente', async () => {
    await req
      .get(`/elecciones/${idEleccion}/padron/votantes/${'f'.repeat(64)}/proof`)
      .expect(404);
  });

  it('GET /padron/merkle retorna 404 si no hay padrón consolidado', async () => {
    const createResponse = await req
      .post('/elecciones')
      .send({
        ...buildEleccionPayload(),
        nombre: 'Comicio sin padrón',
      })
      .expect(201);
    const emptyEleccionId = createResponse.body.idEleccion as number;

    await req.get(`/elecciones/${emptyEleccionId}/padron/merkle`).expect(404);
  });
});
