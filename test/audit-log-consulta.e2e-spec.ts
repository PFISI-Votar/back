import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StandardMerkleTree } from '@openzeppelin/merkle-tree';
import request from 'supertest';
import { App } from 'supertest/types';
import { newDb } from 'pg-mem';
import { DataSource, Repository } from 'typeorm';
import { AuditLoggerService } from '@/audit/audit-logger.service';
import { AuditModule } from '@/audit/audit.module';
import { AuditLog } from '@/audit/entities/audit-log.entity';
import { TipoEventoAudit } from '@/audit/enums/tipo-evento-audit.enum';
import { AuthModule } from '@/auth/auth.module';
import { AutoridadElectoral } from '@/auth/entities/autoridad-electoral.entity';
import { RefreshSession } from '@/auth/entities/refresh-session.entity';
import { JwtRole } from '@/auth/enums/jwt-role.enum';
import { BlockchainService } from '@/blockchain/blockchain.service';
import { EleccionesModule } from '@/eleccion/eleccion.module';
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
import { EstadoBoleta } from '@/eleccion/lista/enums/estado-boleta.enum';
import { EstadoLista } from '@/eleccion/lista/enums/estado-lista.enum';
import { Lista } from '@/eleccion/lista/entities/lista.entity';
import { MerkleTree } from '@/padron/entities/merkle-tree.entity';
import { PadronElectoral } from '@/padron/entities/padron-electoral.entity';
import { PadronVotante } from '@/padron/entities/padron-votante.entity';
import { MerkleTreeEstado } from '@/padron/enums/merkle-tree-estado.enum';
import { PadronEstado } from '@/padron/enums/padron-estado.enum';
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

const buildEleccionPayload = () => ({
  nombre: 'Comicio E2E Audit Log Search',
  fechaInicio: new Date(Date.now() + 86400000).toISOString(),
  fechaFin: new Date(Date.now() + 172800000).toISOString(),
  tipoVotacion: TipoVotacion.POR_LISTA,
  metodosAutenticacion: [MetodoAutenticacion.SSO_INSTITUCIONAL],
});

describe('Consulta Audit Log (e2e) — VOTAR-371', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let auditRepo: Repository<AuditLog>;
  let auditLogger: AuditLoggerService;
  let adminReq: AuthedRequest;
  let jwtService: JwtService;

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
      verifyMerkleRootOnChain: jest.fn().mockResolvedValue(true),
      syncElectionWindow: jest.fn().mockResolvedValue({
        txHash: '0xwindow',
        blockNumber: 1,
      }),
      syncElectionState: jest.fn().mockResolvedValue({
        txHash: '0xstate',
        blockNumber: 2,
      }),
      publishMerkleRoot: jest.fn(),
      buildExplorerUrl: jest.fn(
        (hash: string) => `https://sepolia.etherscan.io/tx/${hash}`,
      ),
      registerCandidates: jest.fn().mockResolvedValue({
        txHash: '0xcandidates',
        blockNumber: 1,
        alreadySealed: false,
      }),
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
              AUDIT_OBFUSCATION_SALT: 'votar-audit-e2e-salt',
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
        AuditModule,
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

    auditRepo = dataSource.getRepository(AuditLog);
    auditLogger = app.get(AuditLoggerService);
    jwtService = app.get(JwtService);

    const adminToken = jwtService.sign({
      sub: '14988',
      role: JwtRole.ELECTION_ADMIN,
    });
    adminReq = createAuthedRequest(app, adminToken);
  }, 60000);

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }
  });

  const seedEleccionConfigurada = async (): Promise<number> => {
    const response = await adminReq
      .post('/elecciones')
      .send(buildEleccionPayload())
      .expect(201);
    const idEleccion = response.body.idEleccion as number;

    const leaves: [string][] = [
      [`0x${'a'.repeat(64)}`],
      [`0x${'b'.repeat(64)}`],
      [`0x${'c'.repeat(64)}`],
    ];
    const tree = StandardMerkleTree.of(leaves, ['bytes32']);
    const merkleRoot = tree.root;

    const padronRepo = dataSource.getRepository(PadronElectoral);
    const merkleRepo = dataSource.getRepository(MerkleTree);
    const eleccionRepo = dataSource.getRepository(Eleccion);

    const padron = await padronRepo.save(
      padronRepo.create({
        eleccion: { idEleccion } as Eleccion,
        totalVotantesHabilitados: 3,
        hashPadron: merkleRoot.replace(/^0x/, ''),
        estado: PadronEstado.PUBLICADO,
        totalProcesados: 3,
        totalOmitidos: 0,
        novedades: [],
      }),
    );

    await merkleRepo.save(
      merkleRepo.create({
        padron,
        merkleRoot,
        totalHojas: 3,
        estado: MerkleTreeEstado.PUBLICADO_ON_CHAIN,
        treeDump: tree.dump(),
        txHashPublicacion: '0xpub',
        numeroBloque: 100,
      }),
    );

    await eleccionRepo.update(
      { idEleccion },
      { estado: EleccionEstado.CONFIGURADA },
    );

    // VOTAR-345 — transitionToAbierta now resolves candidateIds from the
    // published oferta electoral before sealing them on VoteRegistry.
    const boletaRepo = dataSource.getRepository(Boleta);
    const boleta = await boletaRepo.findOneByOrFail({ idEleccion });
    await boletaRepo.update(
      { idBoleta: boleta.idBoleta },
      { estado: EstadoBoleta.PUBLICADA },
    );

    const categoria = await dataSource.getRepository(Categoria).save(
      dataSource.getRepository(Categoria).create({
        idBoleta: boleta.idBoleta,
        nombre: 'Presidente',
        orden: 1,
      }),
    );

    const lista = await dataSource.getRepository(Lista).save(
      dataSource.getRepository(Lista).create({
        idBoleta: boleta.idBoleta,
        nombre: 'Lista A',
        sigla: 'A',
        estado: EstadoLista.OFICIALIZADA,
        listId: 1,
      }),
    );

    await dataSource.getRepository(Candidato).save(
      dataSource.getRepository(Candidato).create({
        idLista: lista.idLista,
        idCategoria: categoria.idCategoria,
        nombre: 'Candidata',
        apellido: 'Uno',
        datosAdicionales: {},
      }),
    );

    return idEleccion;
  };

  it('returns 401 without token', async () => {
    await request(app.getHttpServer()).get('/audit-log').expect(401);
  });

  it('returns 403 for voter role and logs ACCESO_DENEGADO', async () => {
    const voterToken = jwtService.sign({
      sub: 'voter-1',
      role: JwtRole.VOTER,
    });
    const before = await auditRepo.count({
      where: { tipoEvento: TipoEventoAudit.ACCESO_DENEGADO },
    });

    await request(app.getHttpServer())
      .get('/audit-log')
      .set('Authorization', `Bearer ${voterToken}`)
      .expect(403);

    const after = await auditRepo.count({
      where: { tipoEvento: TipoEventoAudit.ACCESO_DENEGADO },
    });
    expect(after).toBeGreaterThan(before);
  });

  it('UAT-01: filters by obfuscated operator id and hides PII in response', async () => {
    await auditLogger.logLogin({
      actorId: '14988',
      ipOrigen: '10.0.0.5',
      role: JwtRole.ELECTION_ADMIN,
    });

    const idEleccion = await seedEleccionConfigurada();
    await adminReq.post(`/elecciones/${idEleccion}/abrir`).expect(200);

    const actorHash = auditLogger.ofuscarOperador('14988');
    const response = await adminReq
      .get(`/audit-log?actor=${actorHash}`)
      .expect(200);

    expect(response.body.total).toBeGreaterThanOrEqual(2);
    for (const item of response.body.items) {
      expect(item.actor).toBe(actorHash);
    }
    const serialized = JSON.stringify(response.body);
    expect(serialized).not.toMatch(/@/);
    expect(serialized).not.toMatch(/\b\d{1,3}(?:\.\d{1,3}){3}\b/);
    expect(response.body.items[0].identificadorTerminal).toBeTruthy();
  });

  it('UAT-02: filters critical event type within 2h window with pagination', async () => {
    const idEleccion = await seedEleccionConfigurada();
    const openedAt = new Date('2026-07-21T15:00:00.000Z');
    await auditLogger.logComicioAbierto({
      idEleccion,
      actorId: '14988',
      modo: 'MANUAL',
      timestamp: openedAt,
      ipOrigen: '127.0.0.1',
    });
    await auditLogger.logComicioAbierto({
      idEleccion,
      actorId: '14988',
      modo: 'MANUAL',
      timestamp: new Date('2026-07-20T10:00:00.000Z'),
      ipOrigen: '127.0.0.1',
    });

    const response = await adminReq
      .get(
        `/audit-log?tipoEvento=${TipoEventoAudit.COMICIO_ABIERTO}&desde=2026-07-21T14:00:00.000Z&hasta=2026-07-21T16:00:00.000Z&limit=10&page=1`,
      )
      .expect(200);

    expect(response.body.items).toHaveLength(1);
    expect(response.body.items[0].tipoEvento).toBe(
      TipoEventoAudit.COMICIO_ABIERTO,
    );
    expect(response.body.limit).toBe(10);
  });

  it('paginates results without overlap between pages', async () => {
    for (let i = 0; i < 5; i += 1) {
      await auditLogger.logLogin({
        actorId: `operator-${i}`,
        ipOrigen: '127.0.0.1',
      });
    }

    const page1 = await adminReq.get('/audit-log?page=1&limit=2').expect(200);
    const page2 = await adminReq.get('/audit-log?page=2&limit=2').expect(200);

    const idsPage1 = (page1.body.items as { idLog: number }[]).map(
      (item) => item.idLog,
    );
    const idsPage2 = (page2.body.items as { idLog: number }[]).map(
      (item) => item.idLog,
    );
    const intersection = idsPage1.filter((id: number) => idsPage2.includes(id));
    expect(intersection).toHaveLength(0);
  });

  it('returns 422 when desde is after hasta', async () => {
    await adminReq
      .get(
        '/audit-log?desde=2026-07-22T14:00:00.000Z&hasta=2026-07-22T12:00:00.000Z',
      )
      .expect(422);
  });
});
