import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { App } from 'supertest/types';
import { newDb } from 'pg-mem';
import { DataSource } from 'typeorm';
import { AuditLog } from '@/audit/entities/audit-log.entity';
import { AuthModule } from '@/auth/auth.module';
import { AutoridadElectoral } from '@/auth/entities/autoridad-electoral.entity';
import { RefreshSession } from '@/auth/entities/refresh-session.entity';
import { JwtRole } from '@/auth/enums/jwt-role.enum';
import { EleccionesModule } from '@/eleccion/eleccion.module';
import { Eleccion } from '@/eleccion/entities/eleccion.entity';
import { Boleta } from '@/eleccion/lista/entities/boleta.entity';
import { Categoria } from '@/eleccion/lista/entities/categoria.entity';
import { Lista } from '@/eleccion/lista/entities/lista.entity';
import { Candidato } from '@/eleccion/candidato/entities/candidato.entity';
import { ConfiguracionDatosCandidato } from '@/eleccion/candidato/entities/configuracion-datos-candidato.entity';
import { CampoDatosCandidato } from '@/eleccion/candidato/entities/campo-datos-candidato.entity';
import { ConfiguracionComicio } from '@/eleccion/configuracion-comicio/entities/configuracion-comicio.entity';
import { EleccionEstado } from '@/eleccion/enums/eleccion-estado.enum';
import { TipoVotacion } from '@/eleccion/enums/tipo-votacion.enum';
import { PadronElectoral } from '@/padron/entities/padron-electoral.entity';
import { PadronVotante } from '@/padron/entities/padron-votante.entity';
import { MerkleTree } from '@/padron/entities/merkle-tree.entity';
import { BlockchainService } from '@/blockchain/blockchain.service';
import { TipoEventoAudit } from '@/audit/enums/tipo-evento-audit.enum';
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

describe('ArchivarComicio (e2e) - POST /elecciones/:id/archivar (VOTAR-322)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let req: AuthedRequest;
  let blockchainService: jest.Mocked<BlockchainService>;

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

    // AC2: ningún método de escritura debe invocarse jamás al archivar.
    const mockBlockchainService = {
      verifyMerkleRootOnChain: jest.fn(),
      syncElectionState: jest.fn(),
      syncElectionWindow: jest.fn(),
      publishMerkleRoot: jest.fn(),
      buildExplorerUrl: jest.fn(),
      registerCandidates: jest.fn(),
      lockElectionWindow: jest.fn(),
      lockRevoteConfig: jest.fn(),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [
            () => ({
              JWT_SECRET: 'test-secret-for-e2e-tests-min-16',
              JWT_ACCESS_EXPIRES_IN: '15m',
              JWT_REFRESH_EXPIRES_IN: '8h',
              BLOCKCHAIN_PROVIDER_URL: 'http://localhost:8545',
              SMART_CONTRACT_ADDRESS:
                '0x1234567890123456789012345678901234567890',
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
      .overrideProvider(BlockchainService)
      .useValue(mockBlockchainService)
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

    const adminToken = app.get(JwtService).sign({
      sub: '14988',
      role: JwtRole.ELECTION_ADMIN,
    });
    req = createAuthedRequest(app, adminToken);

    blockchainService = app.get(BlockchainService);
  }, 30000);

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const seedEleccion = async (estado: EleccionEstado) => {
    const eleccion = dataSource.getRepository(Eleccion).create({
      nombre: `Comicio ${estado}`,
      descripcion: 'Test de archivado',
      estado,
      fechaInicio: new Date(Date.now() - 172800000),
      fechaFin: new Date(Date.now() - 86400000),
      tipoVotacion: TipoVotacion.POR_LISTA,
    });
    await dataSource.getRepository(Eleccion).save(eleccion);
    return eleccion;
  };

  describe('UAT-01: Archivado manual exitoso', () => {
    it('debe archivar un comicio CERRADA y removerlo del panel activo', async () => {
      const eleccion = await seedEleccion(EleccionEstado.CERRADA);

      const response = await req
        .post(`/elecciones/${eleccion.idEleccion}/archivar`)
        .expect(200);

      expect(response.body).toMatchObject({
        idEleccion: eleccion.idEleccion,
        estado: EleccionEstado.ARCHIVADA,
      });

      const eleccionActualizada = await dataSource
        .getRepository(Eleccion)
        .findOne({ where: { idEleccion: eleccion.idEleccion } });
      expect(eleccionActualizada?.estado).toBe(EleccionEstado.ARCHIVADA);

      // Panel de gestión activa (sin filtro) ya no lo incluye.
      const activos = await req.get('/elecciones').expect(200);
      expect(
        activos.body.find(
          (c: { idEleccion: number }) => c.idEleccion === eleccion.idEleccion,
        ),
      ).toBeUndefined();

      // Pestaña Históricos lo incluye.
      const historicos = await req
        .get('/elecciones?estado=ARCHIVADA')
        .expect(200);
      expect(
        historicos.body.find(
          (c: { idEleccion: number }) => c.idEleccion === eleccion.idEleccion,
        ),
      ).toBeDefined();
    });

    it('debe registrar el archivado en el log de auditoría', async () => {
      const eleccion = await seedEleccion(EleccionEstado.CERRADA);

      await req.post(`/elecciones/${eleccion.idEleccion}/archivar`).expect(200);

      const auditLogs = await dataSource.getRepository(AuditLog).find({
        where: {
          idEleccion: eleccion.idEleccion,
          tipoEvento: TipoEventoAudit.COMICIO_ARCHIVADO,
        },
      });

      expect(auditLogs).toHaveLength(1);
      expect(auditLogs[0].actor).not.toBe('14988');
      expect(auditLogs[0].descripcion).toContain(
        `archivó el comicio ${eleccion.idEleccion}`,
      );
    });
  });

  describe('AC2: aislamiento de la capa blockchain', () => {
    it('no debe invocar ningún método de escritura de BlockchainService', async () => {
      const eleccion = await seedEleccion(EleccionEstado.CERRADA);

      const syncStateSpy = jest.spyOn(blockchainService, 'syncElectionState');
      const syncWindowSpy = jest.spyOn(blockchainService, 'syncElectionWindow');
      const registerCandidatesSpy = jest.spyOn(
        blockchainService,
        'registerCandidates',
      );
      const lockWindowSpy = jest.spyOn(blockchainService, 'lockElectionWindow');
      const lockRevoteSpy = jest.spyOn(blockchainService, 'lockRevoteConfig');
      const publishMerkleSpy = jest.spyOn(
        blockchainService,
        'publishMerkleRoot',
      );

      await req.post(`/elecciones/${eleccion.idEleccion}/archivar`).expect(200);

      expect(syncStateSpy).not.toHaveBeenCalled();
      expect(syncWindowSpy).not.toHaveBeenCalled();
      expect(registerCandidatesSpy).not.toHaveBeenCalled();
      expect(lockWindowSpy).not.toHaveBeenCalled();
      expect(lockRevoteSpy).not.toHaveBeenCalled();
      expect(publishMerkleSpy).not.toHaveBeenCalled();
    });
  });

  describe('Validación de precondiciones', () => {
    it('debe retornar 422 si el comicio no está en estado CERRADA', async () => {
      const eleccion = await seedEleccion(EleccionEstado.ABIERTA);

      const response = await req
        .post(`/elecciones/${eleccion.idEleccion}/archivar`)
        .expect(422);

      expect(response.body.message).toContain('debe estar en estado CERRADA');

      const eleccionActualizada = await dataSource
        .getRepository(Eleccion)
        .findOne({ where: { idEleccion: eleccion.idEleccion } });
      expect(eleccionActualizada?.estado).toBe(EleccionEstado.ABIERTA);
    });
  });

  describe('UAT-03: Seguridad — endpoints administrativos', () => {
    it('debe rechazar el archivado sin token de autenticación (401)', async () => {
      const eleccion = await seedEleccion(EleccionEstado.CERRADA);

      await createAuthedRequest(app, '')
        .post(`/elecciones/${eleccion.idEleccion}/archivar`)
        .expect(401);
    });

    it('debe rechazar el archivado si el usuario no tiene rol ELECTION_ADMIN (403)', async () => {
      const eleccion = await seedEleccion(EleccionEstado.CERRADA);
      const voterToken = app.get(JwtService).sign({
        sub: '99999',
        role: 'VOTER',
      });

      await createAuthedRequest(app, voterToken)
        .post(`/elecciones/${eleccion.idEleccion}/archivar`)
        .expect(403);
    });

    it('debe rechazar sin token la consulta administrativa de un comicio ya archivado (401)', async () => {
      const eleccion = await seedEleccion(EleccionEstado.CERRADA);
      await req.post(`/elecciones/${eleccion.idEleccion}/archivar`).expect(200);

      await createAuthedRequest(app, '')
        .get(`/elecciones/${eleccion.idEleccion}`)
        .expect(401);
    });
  });
});
