import {
  ArgumentsHost,
  BadRequestException,
  HttpStatus,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { GlobalExceptionFilter } from './global-exception.filter';

interface TestErrorBody {
  statusCode: number;
  message: string | string[];
  error?: string;
  path?: string;
  timestamp?: string;
  errors?: unknown;
  [key: string]: unknown;
}

describe('GlobalExceptionFilter — VOTAR-491 (falla segura, sin PII/stack)', () => {
  let filter: GlobalExceptionFilter;
  let jsonMock: jest.Mock<void, [TestErrorBody]>;
  let statusMock: jest.Mock;
  let req: { method: string; originalUrl: string; url: string };

  const buildHost = (): ArgumentsHost =>
    ({
      switchToHttp: () => ({
        getRequest: () => req,
        getResponse: () => ({ status: statusMock }),
      }),
    }) as unknown as ArgumentsHost;

  beforeEach(() => {
    filter = new GlobalExceptionFilter();
    jsonMock = jest.fn<void, [TestErrorBody]>();
    statusMock = jest.fn().mockReturnValue({ json: jsonMock });
    req = {
      method: 'POST',
      originalUrl: '/elecciones/1/padron/import',
      url: '/elecciones/1/padron/import',
    };
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('normaliza un error no controlado (Error crudo) a 500 genérico, sin stack ni mensaje original en el body', () => {
    const inputError = new Error(
      'connection to postgres failed: password authentication failed for user "votar_admin" at 10.0.4.2:5432',
    );

    filter.catch(inputError, buildHost());

    expect(statusMock).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    const body = jsonMock.mock.calls[0][0];
    expect(body.statusCode).toBe(500);
    expect(body.message).toBe(
      'Ocurrió un error al procesar la solicitud. Intente nuevamente más tarde.',
    );
    expect(JSON.stringify(body)).not.toContain('postgres');
    expect(JSON.stringify(body)).not.toContain('votar_admin');
    expect(JSON.stringify(body)).not.toContain('10.0.4.2');
    expect(body).not.toHaveProperty('stack');
  });

  it('registra el detalle completo (incluye stack) sólo en el log interno, nunca en la respuesta', () => {
    const errorSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const inputError = new Error('DNI 30123456 email juan@utn.edu.ar');

    filter.catch(inputError, buildHost());

    expect(errorSpy).toHaveBeenCalled();
    const [logMessage, logStack] = errorSpy.mock.calls[0] as [string, string];
    expect(logMessage).toContain('DNI 30123456');
    expect(logStack).toBe(inputError.stack);

    const body = jsonMock.mock.calls[0][0];
    expect(JSON.stringify(body)).not.toContain('30123456');
    expect(JSON.stringify(body)).not.toContain('juan@utn.edu.ar');
  });

  it('sanea una HttpException >= 500 que embebe detalle interno (ej. error crudo de RPC blockchain)', () => {
    const exception = new ServiceUnavailableException(
      'No se pudo publicar la raíz Merkle on-chain: nonce too low, RPC https://sepolia.infura.io/v3/abcd1234',
    );

    filter.catch(exception, buildHost());

    expect(statusMock).toHaveBeenCalledWith(503);
    const body = jsonMock.mock.calls[0][0];
    expect(body.message).toBe(
      'Ocurrió un error al procesar la solicitud. Intente nuevamente más tarde.',
    );
    expect(JSON.stringify(body)).not.toContain('infura');
    expect(JSON.stringify(body)).not.toContain('nonce too low');
  });

  it('reenvía sin modificar una HttpException 4xx simple (mensaje de negocio ya curado)', () => {
    const exception = new NotFoundException('No existe la elección 42.');

    filter.catch(exception, buildHost());

    expect(statusMock).toHaveBeenCalledWith(404);
    const body = jsonMock.mock.calls[0][0];
    expect(body.statusCode).toBe(404);
    expect(body.message).toBe('No existe la elección 42.');
    expect(body.error).toBe('Not Found');
    expect(body.path).toBe('/elecciones/1/padron/import');
    expect(typeof body.timestamp).toBe('string');
  });

  it('preserva campos estructurados adicionales (errors/violations) de excepciones 422 de validación de dominio', () => {
    const exception = new UnprocessableEntityException({
      statusCode: 422,
      message: 'Validación de datos adicionales fallida',
      errors: [{ campo: 'dni', razon: 'formato inválido' }],
    });

    filter.catch(exception, buildHost());

    expect(statusMock).toHaveBeenCalledWith(422);
    const body = jsonMock.mock.calls[0][0];
    expect(body.message).toBe('Validación de datos adicionales fallida');
    expect(body.errors).toEqual([{ campo: 'dni', razon: 'formato inválido' }]);
  });

  it('reenvía sin modificar los mensajes de validación de ValidationPipe (400, array de mensajes)', () => {
    const exception = new BadRequestException([
      'dni must be a string',
      'email must be an email',
    ]);

    filter.catch(exception, buildHost());

    const body = jsonMock.mock.calls[0][0];
    expect(body.statusCode).toBe(400);
    expect(body.message).toEqual([
      'dni must be a string',
      'email must be an email',
    ]);
  });

  it('no revela si el usuario existe en fallas de autenticación (401)', () => {
    const exception = new UnauthorizedException(
      'Credenciales institucionales inválidas',
    );

    filter.catch(exception, buildHost());

    expect(statusMock).toHaveBeenCalledWith(401);
    const body = jsonMock.mock.calls[0][0];
    expect(body.message).toBe('Credenciales institucionales inválidas');
    expect(body).not.toHaveProperty('stack');
  });
});
