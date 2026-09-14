import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { newDb } from 'pg-mem';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import sharp from 'sharp';
import { AuditLog } from '@/audit/entities/audit-log.entity';
import { AuthModule } from '@/auth/auth.module';
import { AutoridadElectoral } from '@/auth/entities/autoridad-electoral.entity';
import { RefreshSession } from '@/auth/entities/refresh-session.entity';
import { JwtRole } from '@/auth/enums/jwt-role.enum';
import { GlobalExceptionFilter } from '@/common/filters/global-exception.filter';
import { UploadTooLargeFilter } from '@/common/filters/upload-too-large.filter';
import { ImagenElectoral } from '@/common/images/entities/imagen-electoral.entity';
import { ConfiguracionSistemaModule } from '@/configuracion-sistema/configuracion-sistema.module';
import { ConfiguracionSistema } from '@/configuracion-sistema/entities/configuracion-sistema.entity';
import { CategoriasModule } from '@/categoria/categoria.module';
import { EleccionesModule } from '@/eleccion/eleccion.module';
import { Candidato } from '@/eleccion/candidato/entities/candidato.entity';
import { CampoDatosCandidato } from '@/eleccion/candidato/entities/campo-datos-candidato.entity';
import { ConfiguracionDatosCandidato } from '@/eleccion/candidato/entities/configuracion-datos-candidato.entity';
import { ConfiguracionComicio } from '@/eleccion/configuracion-comicio/entities/configuracion-comicio.entity';
import { MetodoAutenticacion } from '@/eleccion/configuracion-comicio/enums/metodo-autenticacion.enum';
import { PoliticaRevoto } from '@/eleccion/configuracion-comicio/enums/politica-revoto.enum';
import { Eleccion } from '@/eleccion/entities/eleccion.entity';
import { EleccionEstado } from '@/eleccion/enums/eleccion-estado.enum';
import { TipoVotacion } from '@/eleccion/enums/tipo-votacion.enum';
import { Boleta } from '@/eleccion/lista/entities/boleta.entity';
import { Categoria } from '@/eleccion/lista/entities/categoria.entity';
import { Lista } from '@/eleccion/lista/entities/lista.entity';
import { PadronElectoral } from '@/padron/entities/padron-electoral.entity';
import { PadronVotante } from '@/padron/entities/padron-votante.entity';
import { MerkleTree } from '@/padron/entities/merkle-tree.entity';
import {
  createAuthedRequest,
  issueTestSessionToken,
  type AuthedRequest,
} from './helpers/auth-test.helper';

const IMAGE_URL = /^\/imagenes\/[0-9a-f-]{36}$/i;
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const MAX_PADRON_BYTES = 5 * 1024 * 1024;

const entities = [
  ConfiguracionSistema,
  ImagenElectoral,
  AutoridadElectoral,
  RefreshSession,
  AuditLog,
  Eleccion,
  Boleta,
  Categoria,
  Lista,
  Candidato,
  ConfiguracionDatosCandidato,
  CampoDatosCandidato,
  ConfiguracionComicio,
  PadronElectoral,
  PadronVotante,
  MerkleTree,
];

/**
 * VOTAR-490 — los endpoints de upload rechazan spoofing y tamaño, y un
 * filename con `../` no se convierte en path persistido.
 */
describe('Uploads security (e2e) — VOTAR-490', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let req: AuthedRequest;
  let idEleccion: number;
  let idLista: number;
  let idCandidato: number;
  let jpeg: Buffer;

  beforeAll(async () => {
    jpeg = await sharp({
      create: {
        width: 16,
        height: 16,
        channels: 3,
        background: '#0f766e',
      },
    })
      .jpeg()
      .toBuffer();

    const db = newDb({ autoCreateForeignKeyIndices: true });
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
      implementation: () => randomUUID(),
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
        CategoriasModule,
        ConfiguracionSistemaModule,
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
    app.useGlobalFilters(
      new GlobalExceptionFilter(),
      new UploadTooLargeFilter(),
    );
    await app.init();

    // VOTAR-492: JwtStrategy exige el claim `sid` verificado contra
    // refresh_session para el panel admin — un JwtService.sign() manual sin
    // sesión ya no alcanza.
    const adminToken = await issueTestSessionToken(
      dataSource,
      app.get(JwtService),
      {
        sub: '14988',
        role: JwtRole.ELECTION_ADMIN,
      },
    );
    req = createAuthedRequest(app, adminToken);

    const eleccion = await dataSource.getRepository(Eleccion).save(
      dataSource.getRepository(Eleccion).create({
        nombre: 'Comicio uploads',
        fechaInicio: new Date('2026-12-01T10:00:00Z'),
        fechaFin: new Date('2026-12-02T10:00:00Z'),
        estado: EleccionEstado.BORRADOR,
        tipoVotacion: TipoVotacion.POR_LISTA,
      }),
    );
    idEleccion = eleccion.idEleccion;
    await dataSource.getRepository(ConfiguracionComicio).save(
      dataSource.getRepository(ConfiguracionComicio).create({
        idEleccion,
        metodosAutenticacion: [MetodoAutenticacion.SSO_INSTITUCIONAL],
        permitirVotoEnBlanco: false,
        permitirVotoMultiple: false,
        maxVotosPorVotante: 1,
        minIntervaloSegundos: 0,
        mostrarResultadosTiempoReal: false,
        politicaRevoto: PoliticaRevoto.DISABLED,
      }),
    );

    const listaRes = await req
      .post(`/elecciones/${idEleccion}/listas`)
      .send({ nombre: 'Lista Test', sigla: 'LT', color: '#2563eb' })
      .expect(201);
    idLista = listaRes.body.idLista as number;

    const categoriaRes = await req
      .post(`/elecciones/${idEleccion}/categorias`)
      .send({
        nombre: 'Presidente',
        maximoPostulantes: 1,
        minimoPostulantes: 0,
      })
      .expect(201);

    const candidatoRes = await req
      .post(`/listas/${idLista}/candidatos`)
      .send({
        nombre: 'Ana',
        apellido: 'Perez',
        idCategoria: categoriaRes.body.idCategoria,
        datosAdicionales: {},
      })
      .expect(201);
    idCandidato = candidatoRes.body.idCandidato as number;
  }, 30000);

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }
  });

  const countImagenes = () => dataSource.getRepository(ImagenElectoral).count();
  const countPadron = () => dataSource.getRepository(PadronElectoral).count();

  const expectNadaPersistido = async (
    imagenesAntes: number,
    padronAntes: number,
  ) => {
    expect(await countImagenes()).toBe(imagenesAntes);
    expect(await countPadron()).toBe(padronAntes);
  };

  it.each([
    {
      nombre: 'logo institucional',
      enviar: (buffer: Buffer, filename: string, contentType: string) =>
        req
          .patch('/configuracion-sistema/logo')
          .attach('logo', buffer, { filename, contentType }),
    },
    {
      nombre: 'logo de lista',
      enviar: (buffer: Buffer, filename: string, contentType: string) =>
        req
          .patch(`/listas/${idLista}/logo`)
          .attach('logo', buffer, { filename, contentType }),
    },
    {
      nombre: 'foto de candidato',
      enviar: (buffer: Buffer, filename: string, contentType: string) =>
        req
          .patch(`/candidatos/${idCandidato}/foto`)
          .attach('foto', buffer, { filename, contentType }),
    },
  ])(
    'rechaza contenido spoofeado y oversized en $nombre',
    async ({ enviar }) => {
      const imagenesAntes = await countImagenes();
      const padronAntes = await countPadron();
      const pdf = Buffer.from('%PDF-1.4 no es una imagen');

      await enviar(pdf, 'foto.png', 'image/png').expect(400);
      await expectNadaPersistido(imagenesAntes, padronAntes);

      const jpegComoPng = await sharp({
        create: {
          width: 8,
          height: 8,
          channels: 3,
          background: '#111111',
        },
      })
        .jpeg()
        .toBuffer();
      await enviar(jpegComoPng, 'foto.png', 'image/png').expect(400);
      await expectNadaPersistido(imagenesAntes, padronAntes);

      await enviar(
        Buffer.alloc(MAX_IMAGE_BYTES + 1, 0xff),
        'grande.jpg',
        'image/jpeg',
      ).expect(400);
      await expectNadaPersistido(imagenesAntes, padronAntes);
    },
  );

  it('un filename con ../ no sale del store: la URL queda /imagenes/<uuid>', async () => {
    const subida = await req
      .patch(`/candidatos/${idCandidato}/foto`)
      .attach('foto', jpeg, {
        filename: '../../../../etc/passwd.jpg',
        contentType: 'image/jpeg',
      })
      .expect(200);

    const fotoUrl = (subida.body as { fotoUrl: string }).fotoUrl;
    expect(fotoUrl).toMatch(IMAGE_URL);
    expect(fotoUrl).not.toContain('..');
    expect(fotoUrl).not.toContain('passwd');

    const lista = await req
      .patch(`/listas/${idLista}/logo`)
      .attach('logo', jpeg, {
        filename: '..\\..\\logo.jpg',
        contentType: 'image/jpeg',
      })
      .expect(200);
    expect((lista.body as { logoUrl: string }).logoUrl).toMatch(IMAGE_URL);

    const institucional = await req
      .patch('/configuracion-sistema/logo')
      .attach('logo', jpeg, {
        filename: '../../../../etc/passwd.png',
        contentType: 'image/jpeg',
      })
      .expect(400);

    const institucionalOk = await req
      .patch('/configuracion-sistema/logo')
      .attach('logo', jpeg, {
        filename: '../../../../etc/passwd.jpg',
        contentType: 'image/jpeg',
      })
      .expect(200);
    const logoUrl = (institucionalOk.body as { logoUrl: string }).logoUrl;
    expect(logoUrl).toMatch(IMAGE_URL);
    expect(institucional.status).toBe(400);

    await request(app.getHttpServer()).get(fotoUrl).expect(200);
  });

  it('rechaza padrón spoofeado u oversized y no persiste filas', async () => {
    const padronAntes = await countPadron();
    const imagenesAntes = await countImagenes();

    await req
      .post(`/elecciones/${idEleccion}/padron/import`)
      .attach('file', Buffer.from('%PDF-1.4 falso'), {
        filename: 'padron.csv',
        contentType: 'text/csv',
      })
      .expect(400);

    await req
      .post(`/elecciones/${idEleccion}/padron/import`)
      .attach('file', Buffer.from('%PDF-1.4 falso'), {
        filename: 'padron.xlsx',
        contentType:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
      .expect(400);

    await req
      .post(`/elecciones/${idEleccion}/padron/import`)
      .attach('file', Buffer.alloc(MAX_PADRON_BYTES + 1, 0x61), {
        filename: 'padron.csv',
        contentType: 'text/csv',
      })
      .expect(400);

    await expectNadaPersistido(imagenesAntes, padronAntes);
  });

  it('un CSV válido con filename sucio se importa y el audit log guarda el basename', async () => {
    const csv = Buffer.from('dni,email\n30111222,ana@frvm.utn.edu.ar\n');
    await req
      .post(`/elecciones/${idEleccion}/padron/import`)
      .attach('file', csv, {
        filename: '../../../../etc/passwd.csv\n',
        contentType: 'text/csv',
      })
      .expect(201);

    const logs = await dataSource.getRepository(AuditLog).find({
      where: { idEleccion },
    });
    const serializado = JSON.stringify(logs);
    expect(serializado).toContain('passwd.csv');
    expect(serializado).not.toContain('../');
    expect(serializado).not.toContain('etc/passwd');
  });
});
