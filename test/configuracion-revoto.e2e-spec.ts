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
import { PoliticaRevoto } from '@/eleccion/configuracion-comicio/enums/politica-revoto.enum';
import { EleccionEstado } from '@/eleccion/enums/eleccion-estado.enum';
import { TipoVotacion } from '@/eleccion/enums/tipo-votacion.enum';
import { MetodoAutenticacion } from '@/eleccion/configuracion-comicio/enums/metodo-autenticacion.enum';
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
];

describe('ConfiguracionRevoto (e2e) — VOTAR-323', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let idEleccion: number;
  let adminToken: string;
  let req: AuthedRequest;

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
              JWT_ACCESS_EXPIRES_IN: '15m',
              JWT_REFRESH_EXPIRES_IN: '8h',
              AUDIT_OBFUSCATION_SALT: 'test-audit-salt',
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

    const jwtService = moduleFixture.get(JwtService);
    adminToken = jwtService.sign({
      sub: 'admin-revoto-e2e',
      role: JwtRole.ELECTION_ADMIN,
    });
    req = createAuthedRequest(app, adminToken);

    const eleccionRepo = dataSource.getRepository(Eleccion);
    const configRepo = dataSource.getRepository(ConfiguracionComicio);
    const eleccion = await eleccionRepo.save(
      eleccionRepo.create({
        nombre: 'Comicio Revoto E2E',
        descripcion: 'Test',
        fechaInicio: new Date(Date.now() + 86400000),
        fechaFin: new Date(Date.now() + 172800000),
        tipoVotacion: TipoVotacion.POR_LISTA,
        estado: EleccionEstado.BORRADOR,
      }),
    );
    idEleccion = eleccion.idEleccion;
    await configRepo.save(
      configRepo.create({
        idEleccion,
        metodosAutenticacion: [MetodoAutenticacion.SSO_INSTITUCIONAL],
        permitirVotoMultiple: false,
        maxVotosPorVotante: 1,
        politicaRevoto: PoliticaRevoto.DISABLED,
      }),
    );
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET configuracion-revoto devuelve defaults', async () => {
    const response = await req
      .get(`/elecciones/${idEleccion}/configuracion-revoto`)
      .expect(200);

    expect(response.body).toMatchObject({
      idEleccion,
      permitirVotoMultiple: false,
      maxVotosPorVotante: 1,
      politicaRevoto: PoliticaRevoto.DISABLED,
      editable: true,
    });
  });

  it('UAT-01: PUT desactivado persiste false y maxVotos=1', async () => {
    await req
      .put(`/elecciones/${idEleccion}/configuracion-revoto`)
      .send({ permitirVotoMultiple: true })
      .expect(200);

    const getEnabled = await req
      .get(`/elecciones/${idEleccion}/configuracion-revoto`)
      .expect(200);
    expect(getEnabled.body).toMatchObject({
      permitirVotoMultiple: true,
      maxVotosPorVotante: 2,
      politicaRevoto: PoliticaRevoto.LAST_VOTE_WINS,
    });

    const response = await req
      .put(`/elecciones/${idEleccion}/configuracion-revoto`)
      .send({ permitirVotoMultiple: false })
      .expect(200);

    expect(response.body).toMatchObject({
      permitirVotoMultiple: false,
      maxVotosPorVotante: 1,
      politicaRevoto: PoliticaRevoto.DISABLED,
    });

    const row = await dataSource.getRepository(ConfiguracionComicio).findOne({
      where: { idEleccion },
    });
    expect(row?.permitirVotoMultiple).toBe(false);
    expect(row?.maxVotosPorVotante).toBe(1);
  });

  it('UAT-02: PUT con maxVotos=5 y re-voto off retorna 422', async () => {
    await req
      .put(`/elecciones/${idEleccion}/configuracion-revoto`)
      .send({ permitirVotoMultiple: false, maxVotosPorVotante: 5 })
      .expect(422);
  });

  it('VOTAR-324: PUT con maxVotosPorVotante=10 (tope superior) retorna 200', async () => {
    const response = await req
      .put(`/elecciones/${idEleccion}/configuracion-revoto`)
      .send({ permitirVotoMultiple: true, maxVotosPorVotante: 10 })
      .expect(200);

    expect(response.body).toMatchObject({
      permitirVotoMultiple: true,
      maxVotosPorVotante: 10,
      politicaRevoto: PoliticaRevoto.LAST_VOTE_WINS,
    });

    // vuelve a un estado conocido para no afectar los tests siguientes
    await req
      .put(`/elecciones/${idEleccion}/configuracion-revoto`)
      .send({ permitirVotoMultiple: false })
      .expect(200);
  });

  it('UAT-02: intrusión con maxVotosPorVotante=15 retorna 422 y no persiste cambios', async () => {
    const before = await dataSource
      .getRepository(ConfiguracionComicio)
      .findOne({
        where: { idEleccion },
      });

    await req
      .put(`/elecciones/${idEleccion}/configuracion-revoto`)
      .send({ permitirVotoMultiple: true, maxVotosPorVotante: 15 })
      .expect(422);

    const after = await dataSource.getRepository(ConfiguracionComicio).findOne({
      where: { idEleccion },
    });
    expect(after?.permitirVotoMultiple).toBe(before?.permitirVotoMultiple);
    expect(after?.maxVotosPorVotante).toBe(before?.maxVotosPorVotante);
    expect(after?.politicaRevoto).toBe(before?.politicaRevoto);
  });

  it('PUT en comicio CONFIGURADA retorna 409', async () => {
    await dataSource.getRepository(Eleccion).update(idEleccion, {
      estado: EleccionEstado.CONFIGURADA,
    });

    await req
      .put(`/elecciones/${idEleccion}/configuracion-revoto`)
      .send({ permitirVotoMultiple: true })
      .expect(409);

    await dataSource.getRepository(Eleccion).update(idEleccion, {
      estado: EleccionEstado.BORRADOR,
    });
  });
});
