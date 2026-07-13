import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuditLoggerService } from '@/audit/audit-logger.service';
import { LogAccesoDenegadoInput } from '@/audit/audit-logger.service';
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';

describe('JwtAuthGuard (VOTAR-314)', () => {
  const logAccesoDenegadoMock = jest.fn<
    Promise<void>,
    [LogAccesoDenegadoInput]
  >();
  let guard: JwtAuthGuard;

  const createContext = (): ExecutionContext => {
    const request = {
      method: 'GET',
      path: '/elecciones',
      ip: '10.0.0.1',
      headers: {},
    };
    return {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as ExecutionContext;
  };

  beforeEach(() => {
    logAccesoDenegadoMock.mockReset();
    logAccesoDenegadoMock.mockResolvedValue(undefined);
    guard = new JwtAuthGuard({
      logAccesoDenegado: logAccesoDenegadoMock,
    } as unknown as AuditLoggerService);
  });

  it('propaga el usuario autenticado', () => {
    const user = { sub: '14988', role: 'election_admin' };
    expect(guard.handleRequest(null, user, null, createContext())).toEqual(
      user,
    );
    expect(logAccesoDenegadoMock).not.toHaveBeenCalled();
  });

  it('rechaza con 401 y alerta auditLogger ante firma inválida', () => {
    expect(() =>
      guard.handleRequest(
        null,
        false,
        { name: 'JsonWebTokenError', message: 'invalid signature' },
        createContext(),
      ),
    ).toThrow(UnauthorizedException);

    expect(logAccesoDenegadoMock).toHaveBeenCalledTimes(1);
    const payload = logAccesoDenegadoMock.mock.calls[0][0];
    expect(payload.actorId).toBe('anonymous');
    expect(payload.endpoint).toBe('GET /elecciones');
    expect(payload.ipOrigen).toBe('10.0.0.1');
    expect(payload.datosAdicionales).toEqual({
      reason: 'invalid_signature',
      guard: 'jwt',
    });
  });

  it('alerta auditLogger ante claims iss/aud discrepantes', () => {
    expect(() =>
      guard.handleRequest(
        null,
        false,
        { message: 'jwt issuer invalid. expected: https://votar.local/idp' },
        createContext(),
      ),
    ).toThrow(UnauthorizedException);

    const payload = logAccesoDenegadoMock.mock.calls[0][0];
    expect(payload.datosAdicionales).toEqual(
      expect.objectContaining({ reason: 'invalid_issuer' }),
    );
  });
});
