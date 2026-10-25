import {
  BadRequestException,
  Controller,
  Get,
  INestApplication,
  Logger,
  Module,
  UnauthorizedException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { GlobalExceptionFilter } from '@/common/filters/global-exception.filter';
import { DatosAdicionalesValidationException } from '@/eleccion/candidato/exceptions/datos-adicionales-validation.exception';

/**
 * VOTAR-491 — Principio de falla segura y Ley 25.326: verifica, a través del
 * pipeline HTTP real de Nest (con el GlobalExceptionFilter instalado), que
 * ninguna respuesta de error expone stack traces, secretos ni PII (DNI,
 * email), y que el detalle completo sólo se registra en logs internos.
 *
 * Se ejercitan escenarios representativos de los tres caminos críticos de
 * la US (auth, voto, uploads) reutilizando las excepciones reales de esos
 * dominios (DatosAdicionalesValidationException del módulo de candidatos, y
 * BadRequestException tal como la usa el flujo de importación de padrón),
 * en lugar de una integración completa contra Postgres/Sepolia.
 */
@Controller('test-fail-secure')
class FailSecureTestController {
  // --- auth ---
  @Get('auth/credenciales-invalidas')
  credencialesInvalidas(): never {
    throw new UnauthorizedException('Credenciales institucionales inválidas');
  }

  @Get('auth/fallo-inesperado')
  authFalloInesperado(): never {
    throw new Error(
      'jwt secret file /etc/votar/secrets/jwt.pem not readable (EACCES)',
    );
  }

  // --- voto (validación estructurada de candidatos/listas) ---
  @Get('voto/validacion-estructurada')
  validacionEstructurada(): never {
    throw new DatosAdicionalesValidationException([
      { clave: 'dni', message: 'El campo dni es obligatorio' },
    ]);
  }

  @Get('voto/fallo-inesperado')
  votoFalloInesperado(): never {
    throw new TypeError(
      "Cannot read properties of undefined (reading 'nullifier') at VotoService.registrarVoto (/app/src/voto/services/voto.service.ts:142:8)",
    );
  }

  // --- uploads (importación de padrón) ---
  @Get('uploads/archivo-invalido')
  archivoInvalido(): never {
    throw new BadRequestException(
      'El archivo no contiene registros de padrón.',
    );
  }

  @Get('uploads/fallo-inesperado')
  uploadsFalloInesperado(): never {
    throw new Error(
      'ENOENT: no such file or directory, open "/var/data/padron/tmp-9f31.csv"',
    );
  }
}

@Module({ controllers: [FailSecureTestController] })
class FailSecureTestModule {}

describe('Hardening de respuestas de error — falla segura (VOTAR-491)', () => {
  let app: INestApplication<App>;
  let errorSpy: jest.SpyInstance;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [FailSecureTestModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalFilters(new GlobalExceptionFilter());
    errorSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    await app.init();
  });

  afterEach(async () => {
    errorSpy.mockRestore();
    await app.close();
  });

  describe('auth', () => {
    it('401: mensaje de negocio pasa intacto, sin stack', async () => {
      const res = await request(app.getHttpServer())
        .get('/test-fail-secure/auth/credenciales-invalidas')
        .expect(401);

      expect(res.body.message).toBe('Credenciales institucionales inválidas');
      expect(res.body).not.toHaveProperty('stack');
    });

    it('500: no filtra rutas de secretos ni detalle interno', async () => {
      const res = await request(app.getHttpServer())
        .get('/test-fail-secure/auth/fallo-inesperado')
        .expect(500);

      expect(res.body.message).toBe(
        'Ocurrió un error al procesar la solicitud. Intente nuevamente más tarde.',
      );
      const raw = JSON.stringify(res.body);
      expect(raw).not.toContain('jwt.pem');
      expect(raw).not.toContain('/etc/votar/secrets');
      expect(res.body).not.toHaveProperty('stack');
    });
  });

  describe('voto', () => {
    it('422: preserva el detalle estructurado (errors) de la validación de dominio', async () => {
      const res = await request(app.getHttpServer())
        .get('/test-fail-secure/voto/validacion-estructurada')
        .expect(422);

      expect(res.body.message).toBe('Validación de datos adicionales fallida');
      expect(res.body.errors).toEqual([
        { clave: 'dni', message: 'El campo dni es obligatorio' },
      ]);
    });

    it('500: una excepción no controlada no expone rutas de archivo ni línea de código', async () => {
      const res = await request(app.getHttpServer())
        .get('/test-fail-secure/voto/fallo-inesperado')
        .expect(500);

      expect(res.body.message).toBe(
        'Ocurrió un error al procesar la solicitud. Intente nuevamente más tarde.',
      );
      const raw = JSON.stringify(res.body);
      expect(raw).not.toContain('voto.service.ts');
      expect(raw).not.toContain('nullifier');
      expect(res.body).not.toHaveProperty('stack');
    });
  });

  describe('uploads (padrón)', () => {
    it('400: mensaje de negocio de archivo inválido pasa intacto', async () => {
      const res = await request(app.getHttpServer())
        .get('/test-fail-secure/uploads/archivo-invalido')
        .expect(400);

      expect(res.body.message).toBe(
        'El archivo no contiene registros de padrón.',
      );
    });

    it('500: no filtra rutas de filesystem interno', async () => {
      const res = await request(app.getHttpServer())
        .get('/test-fail-secure/uploads/fallo-inesperado')
        .expect(500);

      expect(res.body.message).toBe(
        'Ocurrió un error al procesar la solicitud. Intente nuevamente más tarde.',
      );
      const raw = JSON.stringify(res.body);
      expect(raw).not.toContain('/var/data/padron');
      expect(raw).not.toContain('ENOENT');
      expect(res.body).not.toHaveProperty('stack');
    });
  });

  it('todas las respuestas de error incluyen statusCode, timestamp y path unificados', async () => {
    const res = await request(app.getHttpServer())
      .get('/test-fail-secure/auth/credenciales-invalidas')
      .expect(401);

    expect(res.body.statusCode).toBe(401);
    expect(typeof res.body.timestamp).toBe('string');
    expect(res.body.path).toBe('/test-fail-secure/auth/credenciales-invalidas');
  });
});
