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
import { MerkleTreeEstado } from '@/padron/enums/merkle-tree-estado.enum';
import { BlockchainService } from '@/blockchain/blockchain.service';
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

describe('AbrirEleccion (e2e) - POST /elecciones/:id/abrir', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let adminToken: string;
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

    const mockBlockchainService = {
      verifyMerkleRootOnChain: jest.fn(),
      syncElectionState: jest.fn(),
      publishMerkleRoot: jest.fn(),
      buildExplorerUrl: jest.fn(),
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

    adminToken = app.get(JwtService).sign({
      sub: '14988',
      role: JwtRole.ELECTION_ADMIN,
    });
    req = createAuthedRequest(app, adminToken);

    // Get the mocked BlockchainService
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

  const seedEleccionConfigurada = async () => {
    const eleccion = dataSource.getRepository(Eleccion).create({
      nombre: 'Elección para Abrir',
      descripcion: 'Test de apertura',
      estado: EleccionEstado.CONFIGURADA,
      fechaInicio: new Date(Date.now() + 86400000),
      fechaFin: new Date(Date.now() + 172800000),
      tipoVotacion: TipoVotacion.POR_LISTA,
    });
    await dataSource.getRepository(Eleccion).save(eleccion);

    const padron = dataSource.getRepository(PadronElectoral).create({
      eleccion,
      totalVotantesHabilitados: 100,
      hashPadron: '0xabc123',
      fechaCarga: new Date(),
    });
    await dataSource.getRepository(PadronElectoral).save(padron);

    // Create a minimal merkle tree dump for testing
    const dummyLeaves = Array.from({ length: 100 }, (_, i) => [
      `0x${i.toString().padStart(64, '0')}`,
    ]);
    const tree = StandardMerkleTree.of(dummyLeaves, ['bytes32']);
    const treeDump = tree.dump();

    const merkle = dataSource.getRepository(MerkleTree).create({
      padron,
      merkleRoot: tree.root,
      estado: MerkleTreeEstado.PUBLICADO_ON_CHAIN,
      totalHojas: 100,
      treeDump,
    });
    await dataSource.getRepository(MerkleTree).save(merkle);

    return { eleccion, padron, merkle };
  };

  describe('UAT-01: Apertura manual exitosa', () => {
    it('debe abrir un comicio CONFIGURADO con Merkle publicado on-chain', async () => {
      const { eleccion } = await seedEleccionConfigurada();

      // Mock de blockchain service
      jest
        .spyOn(blockchainService, 'verifyMerkleRootOnChain')
        .mockResolvedValue(true);
      jest.spyOn(blockchainService, 'syncElectionState').mockResolvedValue({
        txHash: '0xaabbccdd',
        blockNumber: 12345,
      });

      const response = await req
        .post(`/elecciones/${eleccion.idEleccion}/abrir`)
        .expect(200);

      expect(response.body).toMatchObject({
        idEleccion: eleccion.idEleccion,
        estado: EleccionEstado.ABIERTA,
      });

      // Verificar que la elección quedó en estado ABIERTA
      const eleccionActualizada = await dataSource
        .getRepository(Eleccion)
        .findOne({ where: { idEleccion: eleccion.idEleccion } });
      expect(eleccionActualizada?.estado).toBe(EleccionEstado.ABIERTA);
    });
  });

  describe('UAT-02: Validación de precondiciones', () => {
    it('debe retornar 412 si el Merkle no está publicado on-chain', async () => {
      const { eleccion, padron } = await seedEleccionConfigurada();

      // Create a new merkle tree in CONSOLIDADO state (not published on-chain)
      const dummyLeaves = Array.from({ length: 100 }, (_, i) => [
        `0x${(i + 100).toString().padStart(64, '0')}`,
      ]);
      const tree = StandardMerkleTree.of(dummyLeaves, ['bytes32']);

      // Delete existing merkle and create new one in CONSOLIDADO state
      await dataSource.getRepository(MerkleTree).delete({ padron });

      const merkleConsolidado = dataSource.getRepository(MerkleTree).create({
        padron,
        merkleRoot: tree.root,
        estado: MerkleTreeEstado.CONSOLIDADO, // NOT published on-chain
        totalHojas: 100,
        treeDump: tree.dump(),
      });
      await dataSource.getRepository(MerkleTree).save(merkleConsolidado);

      const response = await req
        .post(`/elecciones/${eleccion.idEleccion}/abrir`)
        .expect(412);

      expect(response.body.message).toContain('Fallo de Precondición');
      expect(response.body.message).toContain('Raíz de Merkle');
    });

    it('debe retornar 412 si no hay padrón cargado', async () => {
      const eleccion = dataSource.getRepository(Eleccion).create({
        nombre: 'Elección sin padrón',
        descripcion: 'Test',
        estado: EleccionEstado.CONFIGURADA,
        fechaInicio: new Date(Date.now() + 86400000),
        fechaFin: new Date(Date.now() + 172800000),
        tipoVotacion: TipoVotacion.POR_LISTA,
      });
      await dataSource.getRepository(Eleccion).save(eleccion);

      const response = await req
        .post(`/elecciones/${eleccion.idEleccion}/abrir`)
        .expect(412);

      expect(response.body.message).toContain(
        'El comicio no tiene un padrón electoral cargado',
      );
    });

    it('debe retornar 412 si la raíz de Merkle no se verifica on-chain', async () => {
      const { eleccion } = await seedEleccionConfigurada();

      // Mock de verificación fallida
      jest
        .spyOn(blockchainService, 'verifyMerkleRootOnChain')
        .mockResolvedValue(false);

      const response = await req
        .post(`/elecciones/${eleccion.idEleccion}/abrir`)
        .expect(412);

      expect(response.body.message).toContain(
        'La raíz de Merkle no pudo ser verificada en la blockchain',
      );
    });

    it('debe retornar 422 si el estado no es CONFIGURADA', async () => {
      const eleccion = dataSource.getRepository(Eleccion).create({
        nombre: 'Elección en BORRADOR',
        descripcion: 'Test',
        estado: EleccionEstado.BORRADOR,
        fechaInicio: new Date(Date.now() + 86400000),
        fechaFin: new Date(Date.now() + 172800000),
        tipoVotacion: TipoVotacion.POR_LISTA,
      });
      await dataSource.getRepository(Eleccion).save(eleccion);

      const response = await req
        .post(`/elecciones/${eleccion.idEleccion}/abrir`)
        .expect(422);

      expect(response.body.message).toContain(
        'El comicio debe estar en estado CONFIGURADA para ser abierto',
      );
    });
  });

  describe('Auditoría y sincronización on-chain', () => {
    it('debe registrar la apertura en el log de auditoría', async () => {
      const { eleccion } = await seedEleccionConfigurada();

      jest
        .spyOn(blockchainService, 'verifyMerkleRootOnChain')
        .mockResolvedValue(true);
      jest.spyOn(blockchainService, 'syncElectionState').mockResolvedValue({
        txHash: '0xaabbccdd',
        blockNumber: 12345,
      });

      await req.post(`/elecciones/${eleccion.idEleccion}/abrir`).expect(200);

      const auditLogs = await dataSource.getRepository(AuditLog).find({
        where: { idEleccion: eleccion.idEleccion },
      });

      // Verify that audit logs were created
      expect(auditLogs.length).toBeGreaterThan(0);

      // At least one log should be present - we'll verify the actor
      expect(auditLogs[0].actor).toBe('14988');
    });

    it('debe llamar a syncElectionState', async () => {
      const { eleccion } = await seedEleccionConfigurada();

      const syncSpy = jest
        .spyOn(blockchainService, 'syncElectionState')
        .mockResolvedValue({
          txHash: '0xaabbccdd',
          blockNumber: 12345,
        });

      jest
        .spyOn(blockchainService, 'verifyMerkleRootOnChain')
        .mockResolvedValue(true);

      await req.post(`/elecciones/${eleccion.idEleccion}/abrir`).expect(200);

      expect(syncSpy).toHaveBeenCalledWith(
        eleccion.idEleccion,
        EleccionEstado.ABIERTA,
      );
    });
  });

  describe('Seguridad', () => {
    it('debe rechazar la petición sin token de autenticación', async () => {
      const { eleccion } = await seedEleccionConfigurada();

      await createAuthedRequest(app, '')
        .post(`/elecciones/${eleccion.idEleccion}/abrir`)
        .expect(401);
    });

    it('debe rechazar si el usuario no tiene rol ELECTION_ADMIN', async () => {
      const { eleccion } = await seedEleccionConfigurada();

      const voterToken = app.get(JwtService).sign({
        sub: '99999',
        role: 'VOTER',
      });

      await createAuthedRequest(app, voterToken)
        .post(`/elecciones/${eleccion.idEleccion}/abrir`)
        .expect(403);
    });
  });
});
