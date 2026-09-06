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
import { ConfiguracionSistemaModule } from '@/configuracion-sistema/configuracion-sistema.module';
import { ConfiguracionSistema } from '@/configuracion-sistema/entities/configuracion-sistema.entity';
import { ImagenElectoral } from '@/common/images/entities/imagen-electoral.entity';
import { Eleccion } from '@/eleccion/entities/eleccion.entity';
import { Boleta } from '@/eleccion/lista/entities/boleta.entity';
import { Categoria } from '@/eleccion/lista/entities/categoria.entity';
import { Lista } from '@/eleccion/lista/entities/lista.entity';
import { Candidato } from '@/eleccion/candidato/entities/candidato.entity';
import { ConfiguracionDatosCandidato } from '@/eleccion/candidato/entities/configuracion-datos-candidato.entity';
import { CampoDatosCandidato } from '@/eleccion/candidato/entities/campo-datos-candidato.entity';
import { ConfiguracionComicio } from '@/eleccion/configuracion-comicio/entities/configuracion-comicio.entity';
import {
  createAuthedRequest,
  type AuthedRequest,
} from './helpers/auth-test.helper';

// Mismo grafo de entidades que crear-eleccion.e2e-spec.ts: AuditLog y
// Eleccion arrastran relaciones hacia Boleta/Lista/Candidato/etc. — TypeORM
// exige que todo el grafo esté registrado aunque este test no las use.
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
];

/**
 * VOTAR-466 — round-trip que demuestra el ticket cerrado: subir una imagen
 * persiste en Postgres (no en disco), GET la sirve con caching por ETag, y
 * DELETE la borra. Usa el logo institucional como punto de entrada porque
 * su singleton no requiere sembrar una elección completa.
 */
describe('Imágenes electorales (e2e) — VOTAR-466', () => {
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
    // TypeORM emite DEFAULT uuid_generate_v4() para @PrimaryGeneratedColumn('uuid')
    // en el driver postgres; pg-mem no lo trae nativo.
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

  it('sube, sirve con ETag/caching y elimina una imagen electoral', async () => {
    const jpegOriginal = await sharp({
      create: {
        width: 1000,
        height: 1000,
        channels: 3,
        background: '#0f766e',
      },
    })
      .jpeg()
      .toBuffer();

    const subida = await req
      .patch('/configuracion-sistema/logo')
      .attach('logo', jpegOriginal, 'logo.jpg')
      .expect(200);

    const logoUrl = (subida.body as { logoUrl: string | null }).logoUrl;
    expect(logoUrl).toMatch(/^\/imagenes\/[0-9a-f-]{36}$/);

    // El backend re-codifica a WebP y aplica el presupuesto de tamaño
    // (VOTAR-466): la respuesta debe pesar sensiblemente menos que el JPEG
    // subido, sin necesitar autenticación para leerla.
    const primeraLectura = await request(app.getHttpServer())
      .get(logoUrl as string)
      .expect(200);
    expect(primeraLectura.headers['content-type']).toBe('image/webp');
    expect(primeraLectura.headers['cache-control']).toContain('immutable');
    expect(primeraLectura.body.length).toBeLessThan(jpegOriginal.length);

    const etag = primeraLectura.headers['etag'];
    expect(etag).toBeTruthy();

    await request(app.getHttpServer())
      .get(logoUrl as string)
      .set('If-None-Match', etag)
      .expect(304);

    await req.delete('/configuracion-sistema/logo').expect(200);

    await request(app.getHttpServer())
      .get(logoUrl as string)
      .expect(404);
  });
});
