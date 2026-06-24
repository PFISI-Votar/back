import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { App } from 'supertest/types';
import { newDb } from 'pg-mem';
import { DataSource } from 'typeorm';
import { EleccionesModule } from '@/eleccion/eleccion.module';
import { CategoriasModule } from '@/categoria/categoria.module';
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
import type { CampoCandidatoDefinicion } from '@/eleccion/candidato/interfaces/campo-candidato-definicion.interface';
import { mapDefinicionToEntity } from '@/eleccion/candidato/mappers/campo-datos-candidato.mapper';
import { AuditLog } from '@/audit/entities/audit-log.entity';
import { AuthModule } from '@/auth/auth.module';
import { AutoridadElectoral } from '@/auth/entities/autoridad-electoral.entity';
import { JwtRole } from '@/auth/enums/jwt-role.enum';
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

const camposConfigE2E: CampoCandidatoDefinicion[] = [
  {
    clave: 'legajo_utn',
    etiqueta: 'Legajo UTN',
    tipo: 'texto',
    obligatorio: true,
    orden: 1,
    validacion: {
      pattern: '^\\d{4,6}$',
      patternMessage: 'El legajo UTN debe tener entre 4 y 6 dígitos',
    },
  },
  {
    clave: 'dni',
    etiqueta: 'DNI',
    tipo: 'texto',
    obligatorio: true,
    orden: 2,
    validacion: {
      pattern: '^\\d{7,8}$',
      patternMessage: 'El DNI debe tener entre 7 y 8 dígitos numéricos',
    },
  },
  {
    clave: 'cantidad_avales',
    etiqueta: 'Cantidad de avales',
    tipo: 'numero',
    obligatorio: true,
    orden: 3,
    validacion: { min: 1 },
  },
];

const datosAdicionalesValidos = {
  legajo_utn: '14988',
  dni: '40123456',
  cantidad_avales: 2,
};

describe('ListaCandidato (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let idEleccion: number;
  let idLista: number;
  let idCategoria: number;
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
        CategoriasModule,
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

  const seedConfig = async (eleccionId: number) => {
    const configRepo = dataSource.getRepository(ConfiguracionDatosCandidato);
    const campoRepo = dataSource.getRepository(CampoDatosCandidato);
    const config = await configRepo.save(
      configRepo.create({ idEleccion: eleccionId }),
    );
    await campoRepo.save(
      camposConfigE2E.map((definicion) => {
        const entity = mapDefinicionToEntity(definicion);
        entity.idConfiguracion = config.idConfiguracion;
        return entity;
      }),
    );
  };

  const crearCategoriaE2E = async (
    eleccionId: number,
    payload: {
      nombre: string;
      maximoPostulantes: number;
      minimoPostulantes?: number;
    } = {
      nombre: 'Presidente',
      maximoPostulantes: 1,
      minimoPostulantes: 0,
    },
  ) =>
    req.post(`/elecciones/${eleccionId}/categorias`).send(payload).expect(201);

  it('UAT-01: ciclo completo CRUD en comicio BORRADOR', async () => {
    const eleccionRepo = dataSource.getRepository(Eleccion);
    const eleccion = await eleccionRepo.save(
      eleccionRepo.create({
        nombre: 'Comicio E2E',
        fechaInicio: new Date('2026-12-01T10:00:00Z'),
        fechaFin: new Date('2026-12-02T10:00:00Z'),
        estado: EleccionEstado.BORRADOR,
        tipoVotacion: TipoVotacion.POR_LISTA,
      }),
    );
    idEleccion = eleccion.idEleccion;
    await seedConfig(idEleccion);

    const listaRes = await req
      .post(`/elecciones/${idEleccion}/listas`)
      .send({ nombre: 'Lista Test', sigla: 'LT', color: '#2563eb' })
      .expect(201);

    idLista = listaRes.body.idLista;
    expect(listaRes.body.nombre).toBe('Lista Test');

    const categoriaRes = await crearCategoriaE2E(idEleccion);
    idCategoria = categoriaRes.body.idCategoria;

    const candidatoRes = await req
      .post(`/listas/${idLista}/candidatos`)
      .send({
        nombre: 'Juan',
        apellido: 'Pérez',
        idCategoria,
        datosAdicionales: datosAdicionalesValidos,
      })
      .expect(201);

    const idCandidato = candidatoRes.body.idCandidato;

    await req
      .patch(`/candidatos/${idCandidato}`)
      .send({ nombre: 'Juán' })
      .expect(200)
      .expect((res) => {
        expect(res.body.nombre).toBe('Juán');
      });

    await req.delete(`/candidatos/${idCandidato}`).expect(200);
  });

  it('UAT-02: debe retornar 409 al modificar tras oficialización', async () => {
    const candidatoRes = await req
      .post(`/listas/${idLista}/candidatos`)
      .send({
        nombre: 'María',
        apellido: 'García',
        idCategoria,
        datosAdicionales: {
          legajo_utn: '15074',
          dni: '39123456',
          cantidad_avales: 3,
        },
      })
      .expect(201);

    await req.post(`/elecciones/${idEleccion}/oficializar`).expect(201);

    await req
      .patch(`/candidatos/${candidatoRes.body.idCandidato}`)
      .send({ nombre: 'Modificado' })
      .expect(409);

    await req
      .post(`/listas/${idLista}/candidatos`)
      .send({
        nombre: 'Nuevo',
        apellido: 'Candidato',
        idCategoria,
        datosAdicionales: {
          legajo_utn: '14991',
          dni: '38123456',
          cantidad_avales: 1,
        },
      })
      .expect(409);

    await req
      .post(`/elecciones/${idEleccion}/listas`)
      .send({ nombre: 'Lista Bloqueada', sigla: 'LB2', color: '#2563eb' })
      .expect(409);

    await req
      .patch(`/listas/${idLista}`)
      .send({ nombre: 'Lista Modificada' })
      .expect(409);

    await req.delete(`/listas/${idLista}`).expect(409);
  });

  it('debe retornar 422 por categoría inválida', async () => {
    const eleccion = await dataSource.getRepository(Eleccion).save(
      dataSource.getRepository(Eleccion).create({
        nombre: 'Comicio 422',
        fechaInicio: new Date('2026-12-05T10:00:00Z'),
        fechaFin: new Date('2026-12-06T10:00:00Z'),
        estado: EleccionEstado.BORRADOR,
        tipoVotacion: TipoVotacion.POR_LISTA,
      }),
    );
    await seedConfig(eleccion.idEleccion);

    const listaRes = await req
      .post(`/elecciones/${eleccion.idEleccion}/listas`)
      .send({ nombre: 'Lista 422', sigla: 'L4', color: '#2563eb' })
      .expect(201);

    await req
      .post(`/listas/${listaRes.body.idLista}/candidatos`)
      .send({
        nombre: 'Sin',
        apellido: 'Avales',
        idCategoria: 99999,
        datosAdicionales: datosAdicionalesValidos,
      })
      .expect(422);
  });

  it('debe permitir editar config sin candidatos y bloquear con candidatos', async () => {
    const eleccion = await dataSource.getRepository(Eleccion).save(
      dataSource.getRepository(Eleccion).create({
        nombre: 'Comicio Config',
        fechaInicio: new Date('2026-12-10T10:00:00Z'),
        fechaFin: new Date('2026-12-11T10:00:00Z'),
        estado: EleccionEstado.BORRADOR,
        tipoVotacion: TipoVotacion.POR_LISTA,
      }),
    );
    await seedConfig(eleccion.idEleccion);

    await req
      .get(`/elecciones/${eleccion.idEleccion}/configuracion-datos-candidato`)
      .expect(200)
      .expect((res) => {
        expect(res.body.editable).toBe(true);
        expect(res.body.campos).toHaveLength(3);
      });

    const nuevaConfig = [
      {
        clave: 'propuesta',
        etiqueta: 'Propuesta',
        tipo: 'texto',
        obligatorio: true,
        orden: 1,
      },
    ];

    await req
      .put(`/elecciones/${eleccion.idEleccion}/configuracion-datos-candidato`)
      .send({ campos: nuevaConfig })
      .expect(200)
      .expect((res) => {
        expect(res.body.campos[0].clave).toBe('propuesta');
      });

    const listaRes = await req
      .post(`/elecciones/${eleccion.idEleccion}/listas`)
      .send({ nombre: 'Lista Config', sigla: 'LC', color: '#2563eb' })
      .expect(201);

    const categoriaRes = await crearCategoriaE2E(eleccion.idEleccion);

    const candidatoRes = await req
      .post(`/listas/${listaRes.body.idLista}/candidatos`)
      .send({
        nombre: 'Ana',
        apellido: 'López',
        idCategoria: categoriaRes.body.idCategoria,
        datosAdicionales: { propuesta: 'Mi plan de gobierno' },
      })
      .expect(201);

    await req
      .put(`/elecciones/${eleccion.idEleccion}/configuracion-datos-candidato`)
      .send({ campos: nuevaConfig })
      .expect(409);

    await req
      .delete(`/candidatos/${candidatoRes.body.idCandidato}`)
      .expect(200);

    await req
      .get(`/elecciones/${eleccion.idEleccion}/configuracion-datos-candidato`)
      .expect(200)
      .expect((res) => {
        expect(res.body.editable).toBe(true);
      });
  });

  it('debe retornar 422 con errors[] por datos adicionales inválidos', async () => {
    const eleccion = await dataSource.getRepository(Eleccion).save(
      dataSource.getRepository(Eleccion).create({
        nombre: 'Comicio Validación',
        fechaInicio: new Date('2026-12-12T10:00:00Z'),
        fechaFin: new Date('2026-12-13T10:00:00Z'),
        estado: EleccionEstado.BORRADOR,
        tipoVotacion: TipoVotacion.POR_LISTA,
      }),
    );
    await seedConfig(eleccion.idEleccion);

    const listaRes = await req
      .post(`/elecciones/${eleccion.idEleccion}/listas`)
      .send({ nombre: 'Lista Val', sigla: 'LV', color: '#2563eb' })
      .expect(201);

    const categoriaRes = await crearCategoriaE2E(eleccion.idEleccion);

    await req
      .post(`/listas/${listaRes.body.idLista}/candidatos`)
      .send({
        nombre: 'Pedro',
        apellido: 'Ruiz',
        idCategoria: categoriaRes.body.idCategoria,
        datosAdicionales: {
          legajo_utn: 'abc',
          dni: '40123456',
          cantidad_avales: 2,
        },
      })
      .expect(422)
      .expect((res) => {
        expect(res.body.errors).toBeDefined();
        expect(
          res.body.errors.some(
            (e: { clave: string }) => e.clave === 'legajo_utn',
          ),
        ).toBe(true);
      });
  });

  describe('US-319: validar mínimo de candidatos al oficializar', () => {
    const buildComicioMinimoPayload = () => ({
      nombre: 'Comicio Mínimo UAT',
      fechaInicio: new Date(Date.now() + 86400000).toISOString(),
      fechaFin: new Date(Date.now() + 172800000).toISOString(),
      tipoVotacion: TipoVotacion.POR_LISTA,
      metodosAutenticacion: [MetodoAutenticacion.SSO_INSTITUCIONAL],
    });

    const crearCandidatoEnLista = async (
      idLista: number,
      idCategoria: number,
      suffix: string,
    ) => {
      return req
        .post(`/listas/${idLista}/candidatos`)
        .send({
          nombre: `Nombre${suffix}`,
          apellido: `Apellido${suffix}`,
          idCategoria,
          datosAdicionales: {
            legajo_utn: `${14980 + Number(suffix)}`,
            dni: `${40123450 + Number(suffix)}`,
            cantidad_avales: 2,
          },
        })
        .expect(201);
    };

    const seedCamposCandidato = async (eleccionId: number) => {
      await req
        .put(`/elecciones/${eleccionId}/configuracion-datos-candidato`)
        .send({ campos: camposConfigE2E })
        .expect(200);
    };

    it('UAT-01: debe rechazar oficialización con desglose de faltantes', async () => {
      const eleccionRes = await req
        .post('/elecciones')
        .send(buildComicioMinimoPayload())
        .expect(201);

      const eleccionId = eleccionRes.body.idEleccion;
      await seedCamposCandidato(eleccionId);

      const listaRes = await req
        .post(`/elecciones/${eleccionId}/listas`)
        .send({ nombre: 'Lista Deficiente', sigla: 'LD', color: '#2563eb' })
        .expect(201);

      const categoriaRes = await crearCategoriaE2E(eleccionId, {
        nombre: 'Presidente',
        maximoPostulantes: 10,
        minimoPostulantes: 5,
      });
      const idCategoria = categoriaRes.body.idCategoria;
      await crearCandidatoEnLista(listaRes.body.idLista, idCategoria, '1');
      await crearCandidatoEnLista(listaRes.body.idLista, idCategoria, '2');

      await req
        .post(`/elecciones/${eleccionId}/oficializar`)
        .expect(422)
        .expect((res) => {
          expect(res.body.violations).toBeDefined();
          expect(res.body.violations).toHaveLength(1);
          expect(res.body.violations[0].faltantes).toBe(3);
          expect(res.body.violations[0].cantidadActual).toBe(2);
          expect(res.body.violations[0].minimoRequerido).toBe(5);
          expect(res.body.violations[0].message).toContain(
            'requiere 3 candidato(s) más',
          );
        });

      const eleccion = await dataSource.getRepository(Eleccion).findOne({
        where: { idEleccion: eleccionId },
      });
      expect(eleccion?.estado).toBe(EleccionEstado.BORRADOR);
    });

    it('UAT-02: debe oficializar tras subsanar candidatos faltantes', async () => {
      const eleccionRes = await req
        .post('/elecciones')
        .send(buildComicioMinimoPayload())
        .expect(201);

      const eleccionId = eleccionRes.body.idEleccion;
      await seedCamposCandidato(eleccionId);

      const listaRes = await req
        .post(`/elecciones/${eleccionId}/listas`)
        .send({ nombre: 'Lista Completa', sigla: 'LC', color: '#2563eb' })
        .expect(201);

      const categoriaRes = await crearCategoriaE2E(eleccionId, {
        nombre: 'Presidente',
        maximoPostulantes: 10,
        minimoPostulantes: 5,
      });
      const idCategoria = categoriaRes.body.idCategoria;
      for (let index = 1; index <= 5; index += 1) {
        await crearCandidatoEnLista(
          listaRes.body.idLista,
          idCategoria,
          String(index + 10),
        );
      }

      await req
        .post(`/elecciones/${eleccionId}/oficializar`)
        .expect(201)
        .expect((res) => {
          expect(res.body.estado).toBe(EleccionEstado.CONFIGURADA);
          expect(res.body.mapeo).toHaveLength(1);
        });

      const eleccion = await dataSource.getRepository(Eleccion).findOne({
        where: { idEleccion: eleccionId },
      });
      expect(eleccion?.estado).toBe(EleccionEstado.CONFIGURADA);
    });
  });
});
