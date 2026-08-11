import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StandardMerkleTree } from '@openzeppelin/merkle-tree';
import { App } from 'supertest/types';
import { newDb } from 'pg-mem';
import { DataSource, Repository } from 'typeorm';
import {
  AUDIT_GENESIS_HASH,
  AuditLoggerService,
} from '@/audit/audit-logger.service';
import { AuditLog } from '@/audit/entities/audit-log.entity';
import { TipoEventoAudit } from '@/audit/enums/tipo-evento-audit.enum';
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
import { EleccionEstado } from '@/eleccion/enums/eleccion-estado.enum';
import { TipoVotacion } from '@/eleccion/enums/tipo-votacion.enum';
import { Boleta } from '@/eleccion/lista/entities/boleta.entity';
import { Categoria } from '@/eleccion/lista/entities/categoria.entity';
import { EstadoBoleta } from '@/eleccion/lista/enums/estado-boleta.enum';
import { EstadoLista } from '@/eleccion/lista/enums/estado-lista.enum';
import { Lista } from '@/eleccion/lista/entities/lista.entity';
import { BlockchainService } from '@/blockchain/blockchain.service';
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

const CSV_PADRON = `dni,email
30111222,ana@frvm.utn.edu.ar
30222333,bruno@frvm.utn.edu.ar
30111222,ana@frvm.utn.edu.ar
30333444,carla@frvm.utn.edu.ar`;

const CSV_CORRUPTO = `nombre,apellido
Juan,Perez`;

const buildEleccionPayload = () => ({
  nombre: 'Comicio E2E Audit Log',
  fechaInicio: new Date(Date.now() + 86400000).toISOString(),
  fechaFin: new Date(Date.now() + 172800000).toISOString(),
  tipoVotacion: TipoVotacion.POR_LISTA,
  metodosAutenticacion: [MetodoAutenticacion.SSO_INSTITUCIONAL],
});

describe('Audit Log institucional (e2e) — VOTAR-370', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let auditRepo: Repository<AuditLog>;
  let auditLogger: AuditLoggerService;
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
      lockElectionWindow: jest.fn().mockResolvedValue({
        txHash: '0xlockwin',
        blockNumber: 1,
        alreadyLocked: false,
      }),
      lockRevoteConfig: jest.fn().mockResolvedValue({
        txHash: '0xlockrevote',
        blockNumber: 1,
        alreadyLocked: false,
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

    blockchainService = app.get(BlockchainService);
    auditRepo = dataSource.getRepository(AuditLog);
    auditLogger = app.get(AuditLoggerService);

    const adminToken = app.get(JwtService).sign({
      sub: '14988',
      role: JwtRole.ELECTION_ADMIN,
    });
    req = createAuthedRequest(app, adminToken);
  }, 60000);

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }
  });

  const crearEleccionBorrador = async (): Promise<number> => {
    const response = await req
      .post('/elecciones')
      .send(buildEleccionPayload())
      .expect(201);
    return response.body.idEleccion as number;
  };

  const seedEleccionConfigurada = async (): Promise<number> => {
    const idEleccion = await crearEleccionBorrador();
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

  it('UAT-01: apertura de comicio genera log inmutable con ID ofuscado y terminal criptográfico', async () => {
    const idEleccion = await seedEleccionConfigurada();
    jest
      .spyOn(blockchainService, 'verifyMerkleRootOnChain')
      .mockResolvedValue(true);

    await req.post(`/elecciones/${idEleccion}/abrir`).expect(200);

    const logs = await auditRepo.find({
      where: {
        idEleccion,
        tipoEvento: TipoEventoAudit.COMICIO_ABIERTO,
      },
    });

    expect(logs).toHaveLength(1);
    const entry = logs[0];
    const actorOfuscado = auditLogger.ofuscarOperador('14988');

    expect(entry.actor).toBe(actorOfuscado);
    expect(entry.descripcion).toContain(
      `Usuario Administrador con ID Ofuscado ${actorOfuscado}`,
    );
    expect(entry.descripcion).toContain(`apertura del comicio ${idEleccion}`);
    expect(entry.descripcion).toMatch(
      /identificador de terminal criptográfico [0-9a-f]{64}/,
    );
    expect(entry.descripcion).toMatch(
      /a la hora UTC \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
    );
    expect(entry.hashRegistro).toMatch(/^[0-9a-f]{64}$/);
    expect(entry.hashAnterior).toBeTruthy();
    expect(entry.descripcion).not.toMatch(/\b\d{1,3}(?:\.\d{1,3}){3}\b/);
  });

  it('UAT-02: carga de padrón CSV inserta entrada enriquecida (archivo, filas, duplicados, Merkle)', async () => {
    const idEleccion = await crearEleccionBorrador();

    await req
      .post(`/elecciones/${idEleccion}/padron/import`)
      .attach('file', Buffer.from(CSV_PADRON, 'utf-8'), 'padron-oficial.csv')
      .expect(201);

    const logs = await auditRepo.find({
      where: {
        idEleccion,
        tipoEvento: TipoEventoAudit.PADRON_CARGADO,
      },
    });

    expect(logs).toHaveLength(1);
    const entry = logs[0];
    expect(entry.datosAdicionales).toMatchObject({
      resultado: 'EXITOSO',
      nombreArchivo: 'padron-oficial.csv',
      totalImportados: 3,
      duplicadosExcluidos: 1,
    });
    expect(entry.datosAdicionales?.merkleRoot).toMatch(/^[0-9a-f]{64}$/);
    expect(entry.descripcion).toContain('padron-oficial.csv');
    expect(entry.actor).toBe(auditLogger.ofuscarOperador('14988'));
    expect(entry.hashAnterior).toBeTruthy();
  });

  it('UAT-03: CSV corrupto registra ERROR y preserva continuidad secuencial del hash', async () => {
    const idEleccion = await crearEleccionBorrador();

    // Semilla de cadena previa
    const previa = await auditLogger.logLogin({
      actorId: '14988',
      ipOrigen: '203.0.113.10',
    });

    await req
      .post(`/elecciones/${idEleccion}/padron/import`)
      .attach('file', Buffer.from(CSV_CORRUPTO, 'utf-8'), 'corrupto.csv')
      .expect(400);

    const logs = await auditRepo.find({
      where: {
        idEleccion,
        tipoEvento: TipoEventoAudit.PADRON_CARGADO,
      },
      order: { idLog: 'ASC' },
    });

    expect(logs).toHaveLength(1);
    const fallo = logs[0];
    expect(fallo.datosAdicionales).toMatchObject({
      resultado: 'RECHAZADO',
      nivel: 'ERROR',
      nombreArchivo: 'corrupto.csv',
    });
    expect(fallo.descripcion).toMatch(/fallo de integridad/i);
    expect(fallo.hashAnterior).toBe(previa.hashRegistro);
    expect(fallo.hashRegistro).toMatch(/^[0-9a-f]{64}$/);
    expect(fallo.hashRegistro).not.toBe(previa.hashRegistro);
    expect(
      previa.hashAnterior === AUDIT_GENESIS_HASH || previa.hashAnterior,
    ).toBeTruthy();
  });
});
