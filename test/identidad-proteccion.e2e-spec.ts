import cookieParser from 'cookie-parser';
import { generateKeyPairSync } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import jwt from 'jsonwebtoken';
import { newDb } from 'pg-mem';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource, Repository } from 'typeorm';
import { AuditLog } from '@/audit/entities/audit-log.entity';
import { TipoEventoAudit } from '@/audit/enums/tipo-evento-audit.enum';
import { AuthModule } from '@/auth/auth.module';
import {
  DEFAULT_JWT_AUDIENCE,
  DEFAULT_JWT_ISSUER,
  JWT_KID,
} from '@/auth/constants/jwt-identity.constants';
import { AutoridadElectoral } from '@/auth/entities/autoridad-electoral.entity';
import { RefreshSession } from '@/auth/entities/refresh-session.entity';
import { JwtRole } from '@/auth/enums/jwt-role.enum';
import { AutogestionService } from '@/auth/services/autogestion.service';
import { JwtKeysService } from '@/auth/services/jwt-keys.service';
import { EleccionesModule } from '@/eleccion/eleccion.module';
import { Eleccion } from '@/eleccion/entities/eleccion.entity';
import { Boleta } from '@/eleccion/lista/entities/boleta.entity';
import { Categoria } from '@/eleccion/lista/entities/categoria.entity';
import { Lista } from '@/eleccion/lista/entities/lista.entity';
import { Candidato } from '@/eleccion/candidato/entities/candidato.entity';
import { ConfiguracionDatosCandidato } from '@/eleccion/candidato/entities/configuracion-datos-candidato.entity';
import { CampoDatosCandidato } from '@/eleccion/candidato/entities/campo-datos-candidato.entity';
import { ConfiguracionComicio } from '@/eleccion/configuracion-comicio/entities/configuracion-comicio.entity';
import { withBearer } from './helpers/auth-test.helper';

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

const mockAutogestionService = {
  login: jest.fn().mockResolvedValue('hash-test'),
  fetchUsuario: jest.fn(),
};

describe('Protección de identidad (e2e) — VOTAR-314', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let jwtService: JwtService;
  let jwtKeysService: JwtKeysService;
  let auditLogRepository: Repository<AuditLog>;

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
              // Modo A (BFF interino): JWT_JWKS_URI vacío
              JWT_ACCESS_EXPIRES_IN: '15m',
              JWT_REFRESH_EXPIRES_IN: '8h',
              JWT_ISSUER: DEFAULT_JWT_ISSUER,
              JWT_AUDIENCE: DEFAULT_JWT_AUDIENCE,
              AUTOGESTION_BASE_URL: 'https://autogestion.test',
              DEVELOPMENT: true,
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
      .overrideProvider(AutogestionService)
      .useValue(mockAutogestionService)
      .compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    jwtService = app.get(JwtService);
    jwtKeysService = app.get(JwtKeysService);
    auditLogRepository = dataSource.getRepository(AuditLog);
  }, 60000);

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }
  });

  it('expone JWKS en GET /auth/.well-known/jwks.json', async () => {
    const response = await request(app.getHttpServer())
      .get('/auth/.well-known/jwks.json')
      .expect(200);

    expect(response.body.keys).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kid: JWT_KID,
          alg: 'RS256',
          use: 'sig',
          kty: 'RSA',
        }),
      ]),
    );
  });

  it('UAT-01: JWT firmado válido vía JWKS accede a endpoint protegido con 200', async () => {
    const token = jwtService.sign({
      sub: '14988',
      role: JwtRole.ELECTION_ADMIN,
      email: 'admin@test.local',
    });

    await request(app.getHttpServer())
      .get('/elecciones')
      .set(withBearer(token))
      .expect(200);
  });

  it('UAT-02: firma forjada → 401 y auditLogger', async () => {
    const other = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    const forged = jwt.sign(
      { sub: '14988', role: JwtRole.ELECTION_ADMIN },
      other.privateKey,
      {
        algorithm: 'RS256',
        keyid: JWT_KID,
        issuer: DEFAULT_JWT_ISSUER,
        audience: DEFAULT_JWT_AUDIENCE,
        expiresIn: '15m',
      },
    );

    const countBefore = await auditLogRepository.count({
      where: { tipoEvento: TipoEventoAudit.ACCESO_DENEGADO },
    });

    await request(app.getHttpServer())
      .get('/elecciones')
      .set(withBearer(forged))
      .expect(401);

    const logs = await auditLogRepository.find({
      where: { tipoEvento: TipoEventoAudit.ACCESO_DENEGADO },
      order: { timestamp: 'DESC' },
    });
    expect(logs.length).toBeGreaterThan(countBefore);
    expect(logs[0].actor).toBe('anonymous');
    expect(logs[0].endpoint).toBe('GET /elecciones');
    expect(logs[0].datosAdicionales).toEqual(
      expect.objectContaining({ reason: 'invalid_signature' }),
    );
  });

  it('UAT-03: iss discrepante → 401 y auditLogger con reason invalid_issuer', async () => {
    const badIssToken = jwt.sign(
      { sub: '14988', role: JwtRole.ELECTION_ADMIN },
      jwtKeysService.getPrivateKeyPem(),
      {
        algorithm: 'RS256',
        keyid: JWT_KID,
        issuer: 'https://evil.example/idp',
        audience: DEFAULT_JWT_AUDIENCE,
        expiresIn: '15m',
      },
    );

    const countBefore = await auditLogRepository.count({
      where: { tipoEvento: TipoEventoAudit.ACCESO_DENEGADO },
    });

    await request(app.getHttpServer())
      .get('/elecciones')
      .set(withBearer(badIssToken))
      .expect(401);

    const logs = await auditLogRepository.find({
      where: { tipoEvento: TipoEventoAudit.ACCESO_DENEGADO },
      order: { timestamp: 'DESC' },
    });

    expect(logs.length).toBeGreaterThan(countBefore);
    const latest = logs[0];
    expect(latest.actor).toBe('anonymous');
    expect(latest.endpoint).toBe('GET /elecciones');
    expect(latest.datosAdicionales).toEqual(
      expect.objectContaining({ reason: 'invalid_issuer' }),
    );
  });

  it('UAT-03b: audiencia inválida → 401 y audit con reason invalid_audience', async () => {
    const badAudToken = jwt.sign(
      { sub: '14988', role: JwtRole.ELECTION_ADMIN },
      jwtKeysService.getPrivateKeyPem(),
      {
        algorithm: 'RS256',
        keyid: JWT_KID,
        issuer: DEFAULT_JWT_ISSUER,
        audience: 'other-api',
        expiresIn: '15m',
      },
    );

    const countBefore = await auditLogRepository.count({
      where: { tipoEvento: TipoEventoAudit.ACCESO_DENEGADO },
    });

    await request(app.getHttpServer())
      .get('/elecciones')
      .set(withBearer(badAudToken))
      .expect(401);

    const logs = await auditLogRepository.find({
      where: { tipoEvento: TipoEventoAudit.ACCESO_DENEGADO },
      order: { timestamp: 'DESC' },
    });
    expect(logs.length).toBeGreaterThan(countBefore);
    expect(logs[0].datosAdicionales).toEqual(
      expect.objectContaining({ reason: 'invalid_audience' }),
    );
  });
});
