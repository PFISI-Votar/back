import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ExecutionContext } from '@nestjs/common/interfaces';
import { RolesGuard } from '@/auth/guards/roles.guard';
import { JwtRole } from '@/auth/enums/jwt-role.enum';
import { AuditLoggerService } from '@/audit/audit-logger.service';

describe('RolesGuard', () => {
  let guard: RolesGuard;
  const logAccesoDenegadoMock = jest.fn().mockResolvedValue(undefined);
  let reflector: Reflector;

  const createContext = (user: { sub: string; role: JwtRole } | undefined) => {
    const request = {
      user,
      method: 'GET',
      path: '/elecciones',
      ip: '127.0.0.1',
      headers: {},
    };
    return {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as ExecutionContext;
  };

  beforeEach(() => {
    logAccesoDenegadoMock.mockClear();
    reflector = new Reflector();
    guard = new RolesGuard(reflector, {
      logAccesoDenegado: logAccesoDenegadoMock,
    } as unknown as AuditLoggerService);
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue([JwtRole.ELECTION_ADMIN]);
  });

  it('allows access when user has required role', () => {
    const context = createContext({
      sub: '14988',
      role: JwtRole.ELECTION_ADMIN,
    });

    expect(guard.canActivate(context)).toBe(true);
    expect(logAccesoDenegadoMock).not.toHaveBeenCalled();
  });

  it('throws 403 and logs audit when role is insufficient', () => {
    const context = createContext({ sub: '15079', role: JwtRole.VOTER });

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    expect(logAccesoDenegadoMock).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: '15079',
        endpoint: 'GET /elecciones',
        ipOrigen: '127.0.0.1',
      }),
    );
  });

  it('passes through when no roles are required', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    const context = createContext(undefined);

    expect(guard.canActivate(context)).toBe(true);
  });
});
