import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import { App } from 'supertest/types';
import request from 'supertest';
import { newDb } from 'pg-mem';
import { DataSource, Repository } from 'typeorm';
import { BlockchainService } from '@/blockchain/blockchain.service';
import { Candidato } from '@/eleccion/candidato/entities/candidato.entity';
import { ConfiguracionComicio } from '@/eleccion/configuracion-comicio/entities/configuracion-comicio.entity';
import { MetodoAutenticacion } from '@/eleccion/configuracion-comicio/enums/metodo-autenticacion.enum';
import { PoliticaRevoto } from '@/eleccion/configuracion-comicio/enums/politica-revoto.enum';
import { Eleccion } from '@/eleccion/entities/eleccion.entity';
import { EleccionEstado } from '@/eleccion/enums/eleccion-estado.enum';
import { TipoVotacion } from '@/eleccion/enums/tipo-votacion.enum';
import { EleccionGateway } from '@/eleccion/gateways/eleccion.gateway';
import { Boleta } from '@/eleccion/lista/entities/boleta.entity';
import { Categoria } from '@/eleccion/lista/entities/categoria.entity';
import { Lista } from '@/eleccion/lista/entities/lista.entity';
import { EstadoBoleta } from '@/eleccion/lista/enums/estado-boleta.enum';
import { EstadoLista } from '@/eleccion/lista/enums/estado-lista.enum';
import { EscrutinioPublicController } from '@/escrutinio/controllers/escrutinio-public.controller';
import { CommonRateLimitModule } from '@/common/rate-limit/common-rate-limit.module';
import { EscrutinioCacheService } from '@/escrutinio/services/escrutinio-cache.service';
import { EscrutinioService } from '@/escrutinio/services/escrutinio.service';
import { PadronElectoral } from '@/padron/entities/padron-electoral.entity';

const entities = [
  Eleccion,
  ConfiguracionComicio,
  Boleta,
  Categoria,
  Lista,
  Candidato,
];

describe('Escrutinio público (e2e) — VOTAR-364', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let idEleccion: number;
  let idCandidato: number;

  const mockBlockchain = {
    fetchEscrutinioTallies: jest.fn(),
  };

  const mockPadronRepository = {
    findOne: jest.fn().mockResolvedValue({ totalVotantesHabilitados: 200 }),
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
        ConfigModule.forRoot({ isGlobal: true }),
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
        TypeOrmModule.forFeature(entities),
        CommonRateLimitModule,
      ],
      controllers: [EscrutinioPublicController],
      providers: [
        EscrutinioService,
        EscrutinioCacheService,
        { provide: BlockchainService, useValue: mockBlockchain },
        {
          provide: EleccionGateway,
          useValue: { emitResultadosActualizados: jest.fn() },
        },
        {
          provide: getRepositoryToken(PadronElectoral),
          useValue: mockPadronRepository,
        },
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

    const eleccionRepo = moduleFixture.get<Repository<Eleccion>>(
      getRepositoryToken(Eleccion),
    );
    const configRepo = moduleFixture.get<Repository<ConfiguracionComicio>>(
      getRepositoryToken(ConfiguracionComicio),
    );
    const boletaRepo = moduleFixture.get<Repository<Boleta>>(
      getRepositoryToken(Boleta),
    );
    const categoriaRepo = moduleFixture.get<Repository<Categoria>>(
      getRepositoryToken(Categoria),
    );
    const listaRepo = moduleFixture.get<Repository<Lista>>(
      getRepositoryToken(Lista),
    );
    const candidatoRepo = moduleFixture.get<Repository<Candidato>>(
      getRepositoryToken(Candidato),
    );

    const eleccion = await eleccionRepo.save(
      eleccionRepo.create({
        nombre: 'Comicio Escrutinio E2E',
        descripcion: null,
        estado: EleccionEstado.ABIERTA,
        fechaInicio: new Date(),
        fechaFin: new Date(Date.now() + 86400000),
        tipoVotacion: TipoVotacion.POR_LISTA,
      }),
    );
    idEleccion = eleccion.idEleccion;

    await configRepo.save(
      configRepo.create({
        idEleccion,
        permitirVotoEnBlanco: true,
        permitirVotoMultiple: false,
        maxVotosPorVotante: 1,
        minIntervaloSegundos: 0,
        mostrarResultadosTiempoReal: true,
        duracionMinutos: null,
        metodosAutenticacion: [MetodoAutenticacion.SSO_INSTITUCIONAL],
        politicaRevoto: PoliticaRevoto.DISABLED,
      }),
    );

    const boleta = await boletaRepo.save(
      boletaRepo.create({
        idEleccion,
        titulo: 'Boleta E2E',
        fechaPublicacion: new Date(),
        estado: EstadoBoleta.PUBLICADA,
      }),
    );

    const categoria = await categoriaRepo.save(
      categoriaRepo.create({
        idBoleta: boleta.idBoleta,
        nombre: 'Presidente',
        descripcion: null,
        cantidadCargos: 1,
        minimoPostulantes: 1,
        orden: 1,
      }),
    );

    const lista = await listaRepo.save(
      listaRepo.create({
        idBoleta: boleta.idBoleta,
        nombre: 'Lista Unidad',
        sigla: 'LU',
        color: '#2f6f9f',
        logoUrl: null,
        fechaOficializacion: new Date(),
        estado: EstadoLista.OFICIALIZADA,
        listId: 1,
      }),
    );

    const candidato = await candidatoRepo.save(
      candidatoRepo.create({
        idLista: lista.idLista,
        idCategoria: categoria.idCategoria,
        nombre: 'Ana',
        apellido: 'Pérez',
        orden: 1,
        fotoUrl: null,
        datosAdicionales: {},
      }),
    );
    idCandidato = candidato.idCandidato;
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
    mockBlockchain.fetchEscrutinioTallies.mockResolvedValue({
      participation: { totalVotes: 15, blankVotes: 2, nullVotes: 1 },
      votesByCandidateId: { [idCandidato]: 12 },
    });
  });

  it('GET /elecciones/:id/resultados returns public tallies without auth', async () => {
    const response = await request(app.getHttpServer())
      .get(`/elecciones/${idEleccion}/resultados`)
      .expect(200);

    expect(response.body).toMatchObject({
      idEleccion,
      fuente: 'ON_CHAIN',
      congelado: false,
      participacion: {
        totalVotos: 15,
        votosBlanco: 2,
        votosNulo: 1,
        totalVotantesHabilitados: 200,
        porcentajeParticipacion: 7.5,
      },
    });
    expect(response.body.candidatos).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          idCandidato,
          nombre: 'Ana',
          apellido: 'Pérez',
          votos: 12,
        }),
      ]),
    );
    expect(response.headers['cache-control']).toContain('max-age=3');
  });

  it('returns 422 for BORRADOR elections', async () => {
    const eleccionRepo = app.get<Repository<Eleccion>>(
      getRepositoryToken(Eleccion),
    );
    const borrador = await eleccionRepo.save(
      eleccionRepo.create({
        nombre: 'Borrador',
        descripcion: null,
        estado: EleccionEstado.BORRADOR,
        fechaInicio: new Date(Date.now() + 86400000),
        fechaFin: new Date(Date.now() + 172800000),
        tipoVotacion: TipoVotacion.POR_LISTA,
      }),
    );

    await request(app.getHttpServer())
      .get(`/elecciones/${borrador.idEleccion}/resultados`)
      .expect(422);
  });
});
