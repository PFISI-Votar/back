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
import { MetodoAutenticacion } from '@/eleccion/configuracion-comicio/enums/metodo-autenticacion.enum';
import { EleccionResponseDto } from '@/eleccion/dto/eleccion-response.dto';
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
  AuditLog,
];

const buildValidPayload = () => ({
  nombre: 'Comicio E2E Crear',
  fechaInicio: new Date(Date.now() + 86400000).toISOString(),
  fechaFin: new Date(Date.now() + 172800000).toISOString(),
  tipoVotacion: TipoVotacion.POR_LISTA,
  metodosAutenticacion: [MetodoAutenticacion.SSO_INSTITUCIONAL],
});

describe('CrearEleccion (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
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
              JWT_EXPIRES_IN: '8h',
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

    adminToken = app.get(JwtService).sign({
      sub: '14988',
      role: JwtRole.ELECTION_ADMIN,
    });
    req = createAuthedRequest(app, adminToken);
  }, 30000);

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }
  });

  it('UAT-01: POST /elecciones crea comicio en BORRADOR sin categorías iniciales', async () => {
    const response = await req
      .post('/elecciones')
      .send(buildValidPayload())
      .expect(201);

    const body = response.body as EleccionResponseDto;
    expect(body.estado).toBe(EleccionEstado.BORRADOR);
    expect(body.tipoVotacion).toBe(TipoVotacion.POR_LISTA);
    expect(body.roles).toHaveLength(0);
    expect(body.metodosAutenticacion).toContain(
      MetodoAutenticacion.SSO_INSTITUCIONAL,
    );

    const eleccionRepo = dataSource.getRepository(Eleccion);
    const persisted = await eleccionRepo.findOne({
      where: { idEleccion: body.idEleccion },
    });
    expect(persisted?.estado).toBe(EleccionEstado.BORRADOR);
  });

  it('UAT-02: POST /elecciones retorna 422 si cierre es anterior a apertura', async () => {
    const payload = buildValidPayload();
    payload.fechaInicio = new Date(Date.now() + 172800000).toISOString();
    payload.fechaFin = new Date(Date.now() + 86400000).toISOString();

    const response = await req.post('/elecciones').send(payload).expect(422);

    const body = response.body as { message?: string };
    expect(body.message).toContain('Error de validación al crear el comicio');
  });

  it('UAT-03: POST /elecciones retorna 422 si apertura está en el pasado', async () => {
    const payload = buildValidPayload();
    payload.fechaInicio = new Date(Date.now() - 86400000).toISOString();

    await req.post('/elecciones').send(payload).expect(422);
  });

  it('POST /elecciones retorna 422 si cierre está en el pasado', async () => {
    const payload = buildValidPayload();
    payload.fechaInicio = new Date(Date.now() + 172800000).toISOString();
    payload.fechaFin = new Date(Date.now() - 86400000).toISOString();

    const response = await req.post('/elecciones').send(payload).expect(422);

    const body = response.body as {
      errors?: Array<{ field?: string; message?: string }>;
    };
    const fechaFinError = body.errors?.find(
      (error) => error.field === 'fechaFin',
    );
    expect(fechaFinError?.message).toContain('posterior al momento actual');
  });

  it('UAT-04b: POST /elecciones retorna 422 sin métodos de autenticación', async () => {
    const payload = buildValidPayload();
    payload.metodosAutenticacion = [];

    const response = await req.post('/elecciones').send(payload).expect(422);

    const body = response.body as {
      errors?: Array<{ field?: string; message?: string }>;
    };
    const authError = body.errors?.find(
      (error) => error.field === 'metodosAutenticacion',
    );
    expect(authError?.message).toContain('método de inicio de sesión');
  });

  it('sanitiza nombre con scripts maliciosos antes de persistir', async () => {
    const payload = buildValidPayload();
    payload.nombre = '<script>alert(1)</script>Comicio Seguro';

    const response = await req.post('/elecciones').send(payload).expect(201);

    const body = response.body as EleccionResponseDto;
    expect(body.nombre).toBe('Comicio Seguro');
    expect(body.nombre).not.toContain('<script>');

    const eleccionRepo = dataSource.getRepository(Eleccion);
    const persisted = await eleccionRepo.findOne({
      where: { idEleccion: body.idEleccion },
    });
    expect(persisted?.nombre).toBe('Comicio Seguro');
    expect(persisted?.nombre).not.toContain('<script>');
  });
});
