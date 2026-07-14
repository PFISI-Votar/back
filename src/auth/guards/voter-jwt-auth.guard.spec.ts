import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import {
  AuditLoggerService,
  LogAccesoDenegadoInput,
} from '@/audit/audit-logger.service';
import { VoterJwtAuthGuard } from '@/auth/guards/voter-jwt-auth.guard';

describe('VoterJwtAuthGuard (VOTAR-314)', () => {
  const logAccesoDenegadoMock = jest.fn<
    Promise<void>,
    [LogAccesoDenegadoInput]
  >();
  let guard: VoterJwtAuthGuard;

  const createContext = (): ExecutionContext => {
    const request = {
      method: 'POST',
      path: '/elecciones/1/voto',
      ip: '10.0.0.2',
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
    guard = new VoterJwtAuthGuard({
      logAccesoDenegado: logAccesoDenegadoMock,
    } as unknown as AuditLoggerService);
  });

  it('propaga el usuario autenticado', () => {
    const user = { sub: '15079', role: 'voter' };
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
    expect(payload.endpoint).toBe('POST /elecciones/1/voto');
    expect(payload.ipOrigen).toBe('10.0.0.2');
    expect(payload.datosAdicionales).toEqual({
      reason: 'invalid_signature',
      guard: 'voter-jwt',
    });
  });
});
