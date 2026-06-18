import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { newDb } from 'pg-mem';
import { DataSource } from 'typeorm';
import { EleccionesModule } from '../src/eleccion/eleccion.module';
import { Eleccion } from '../src/eleccion/entities/eleccion.entity';
import { Boleta } from '../src/eleccion/entities/boleta.entity';
import { Categoria } from '../src/eleccion/entities/categoria.entity';
import { Lista } from '../src/eleccion/entities/lista.entity';
import { Candidato } from '../src/eleccion/entities/candidato.entity';
import { ConfiguracionDatosCandidato } from '../src/eleccion/entities/configuracion-datos-candidato.entity';
import { EleccionEstado } from '../src/eleccion/enums/eleccion-estado.enum';
import type { CampoCandidatoDefinicion } from '../src/eleccion/interfaces/campo-candidato-definicion.interface';

const entities = [Eleccion, Boleta, Categoria, Lista, Candidato, ConfiguracionDatosCandidato];

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
    await configRepo.save(
      configRepo.create({
        idEleccion: eleccionId,
        campos: camposConfigE2E,
      }),
    );
  };

  it('UAT-01: ciclo completo CRUD en comicio BORRADOR', async () => {
    const eleccionRepo = dataSource.getRepository(Eleccion);
    const eleccion = await eleccionRepo.save(
      eleccionRepo.create({
        nombre: 'Comicio E2E',
        fechaInicio: new Date('2026-12-01T10:00:00Z'),
        fechaFin: new Date('2026-12-02T10:00:00Z'),
        estado: EleccionEstado.BORRADOR,
      }),
    );
    idEleccion = eleccion.idEleccion;
    await seedConfig(idEleccion);

    const listaRes = await request(app.getHttpServer())
      .post(`/elecciones/${idEleccion}/listas`)
      .send({ nombre: 'Lista Test', sigla: 'LT', color: '#2563eb' })
      .expect(201);

    idLista = listaRes.body.idLista;
    expect(listaRes.body.nombre).toBe('Lista Test');

    const boleta = await dataSource.getRepository(Boleta).findOne({
      where: { idEleccion },
      relations: ['categorias'],
    });
    idCategoria = boleta!.categorias[0].idCategoria;

    const candidatoRes = await request(app.getHttpServer())
      .post(`/listas/${idLista}/candidatos`)
      .send({
        nombre: 'Juan',
        apellido: 'Pérez',
        idCategoria,
        datosAdicionales: datosAdicionalesValidos,
      })
      .expect(201);

    const idCandidato = candidatoRes.body.idCandidato;

    await request(app.getHttpServer())
      .patch(`/candidatos/${idCandidato}`)
      .send({ nombre: 'Juán' })
      .expect(200)
      .expect((res) => {
        expect(res.body.nombre).toBe('Juán');
      });

    await request(app.getHttpServer())
      .delete(`/candidatos/${idCandidato}`)
      .expect(200);
  });

  it('UAT-02: debe retornar 409 al modificar tras oficialización', async () => {
    const candidatoRes = await request(app.getHttpServer())
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

    await request(app.getHttpServer())
      .post(`/elecciones/${idEleccion}/oficializar`)
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/candidatos/${candidatoRes.body.idCandidato}`)
      .send({ nombre: 'Modificado' })
      .expect(409);

    await request(app.getHttpServer())
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
  });

  it('debe retornar 422 por categoría inválida', async () => {
    const eleccion = await dataSource.getRepository(Eleccion).save(
      dataSource.getRepository(Eleccion).create({
        nombre: 'Comicio 422',
        fechaInicio: new Date('2026-12-05T10:00:00Z'),
        fechaFin: new Date('2026-12-06T10:00:00Z'),
        estado: EleccionEstado.BORRADOR,
      }),
    );
    await seedConfig(eleccion.idEleccion);

    const listaRes = await request(app.getHttpServer())
      .post(`/elecciones/${eleccion.idEleccion}/listas`)
      .send({ nombre: 'Lista 422', sigla: 'L4', color: '#2563eb' })
      .expect(201);

    await request(app.getHttpServer())
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
      }),
    );
    await seedConfig(eleccion.idEleccion);

    await request(app.getHttpServer())
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

    await request(app.getHttpServer())
      .put(`/elecciones/${eleccion.idEleccion}/configuracion-datos-candidato`)
      .send({ campos: nuevaConfig })
      .expect(200)
      .expect((res) => {
        expect(res.body.campos[0].clave).toBe('propuesta');
      });

    const listaRes = await request(app.getHttpServer())
      .post(`/elecciones/${eleccion.idEleccion}/listas`)
      .send({ nombre: 'Lista Config', sigla: 'LC', color: '#2563eb' })
      .expect(201);

    const boleta = await dataSource.getRepository(Boleta).findOne({
      where: { idEleccion: eleccion.idEleccion },
      relations: ['categorias'],
    });

    const candidatoRes = await request(app.getHttpServer())
      .post(`/listas/${listaRes.body.idLista}/candidatos`)
      .send({
        nombre: 'Ana',
        apellido: 'López',
        idCategoria: boleta!.categorias[0].idCategoria,
        datosAdicionales: { propuesta: 'Mi plan de gobierno' },
      })
      .expect(201);

    await request(app.getHttpServer())
      .put(`/elecciones/${eleccion.idEleccion}/configuracion-datos-candidato`)
      .send({ campos: nuevaConfig })
      .expect(409);

    await request(app.getHttpServer())
      .delete(`/candidatos/${candidatoRes.body.idCandidato}`)
      .expect(200);

    await request(app.getHttpServer())
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
      }),
    );
    await seedConfig(eleccion.idEleccion);

    const listaRes = await request(app.getHttpServer())
      .post(`/elecciones/${eleccion.idEleccion}/listas`)
      .send({ nombre: 'Lista Val', sigla: 'LV', color: '#2563eb' })
      .expect(201);

    const boleta = await dataSource.getRepository(Boleta).findOne({
      where: { idEleccion: eleccion.idEleccion },
      relations: ['categorias'],
    });

    await request(app.getHttpServer())
      .post(`/listas/${listaRes.body.idLista}/candidatos`)
      .send({
        nombre: 'Pedro',
        apellido: 'Ruiz',
        idCategoria: boleta!.categorias[0].idCategoria,
        datosAdicionales: {
          legajo_utn: 'abc',
          dni: '40123456',
          cantidad_avales: 2,
        },
      })
      .expect(422)
      .expect((res) => {
        expect(res.body.errors).toBeDefined();
        expect(res.body.errors.some((e: { clave: string }) => e.clave === 'legajo_utn')).toBe(
          true,
        );
      });
  });
});
