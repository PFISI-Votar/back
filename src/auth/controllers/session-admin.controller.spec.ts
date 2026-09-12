import { Test, TestingModule } from '@nestjs/testing';
import { AuditLoggerService } from '@/audit/audit-logger.service';
import { RevocacionMotivo } from '@/auth/enums/revocacion-motivo.enum';
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';
import { PauserRoleGuard } from '@/auth/guards/pauser-role.guard';
import { RolesGuard } from '@/auth/guards/roles.guard';
import { RefreshTokenService } from '@/auth/services/refresh-token.service';
import { SessionAdminController } from '@/auth/controllers/session-admin.controller';
import type { AuthenticatedRequest } from '@/auth/interfaces/authenticated-request.interface';
import { JwtRole } from '@/auth/enums/jwt-role.enum';

const request = (sid: number): AuthenticatedRequest =>
  ({
    user: { sub: '14988', role: JwtRole.ELECTION_ADMIN, sid },
    headers: {},
    ip: '10.0.0.1',
  }) as unknown as AuthenticatedRequest;

describe('SessionAdminController', () => {
  let controller: SessionAdminController;
  let refreshTokenService: jest.Mocked<
    Pick<
      RefreshTokenService,
      'listActiveSessions' | 'revokeSessionsByUser' | 'revokeAllSessions'
    >
  >;
  let auditLogger: jest.Mocked<Pick<AuditLoggerService, 'logSesionRevocada'>>;

  beforeEach(async () => {
    refreshTokenService = {
      listActiveSessions: jest.fn(),
      revokeSessionsByUser: jest.fn().mockResolvedValue(2),
      revokeAllSessions: jest.fn().mockResolvedValue(4),
    };
    auditLogger = { logSesionRevocada: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SessionAdminController],
      providers: [
        { provide: RefreshTokenService, useValue: refreshTokenService },
        { provide: AuditLoggerService, useValue: auditLogger },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PauserRoleGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(SessionAdminController);
  });

  it('marks the requesting session as `actual` in the listing', async () => {
    refreshTokenService.listActiveSessions.mockResolvedValue([
      {
        idSession: 1,
        identificadorSso: '14988',
        sub: '14988',
        email: null,
        nombre: null,
        createdAt: new Date(),
        lastActivityAt: new Date(),
        expiresAt: new Date(),
      },
      {
        idSession: 2,
        identificadorSso: '15079',
        sub: '15079',
        email: null,
        nombre: null,
        createdAt: new Date(),
        lastActivityAt: new Date(),
        expiresAt: new Date(),
      },
    ] as never);

    const result = await controller.listar(request(1));

    expect(result.find((s) => s.idSession === 1)?.actual).toBe(true);
    expect(result.find((s) => s.idSession === 2)?.actual).toBe(false);
  });

  it('cerrarOtras excludes the current session and logs alcance PROPIA', async () => {
    const result = await controller.cerrarOtras(request(9));

    expect(refreshTokenService.revokeSessionsByUser).toHaveBeenCalledWith(
      expect.objectContaining({
        exceptIdSession: 9,
        motivo: RevocacionMotivo.CIERRE_OTRAS_SESIONES,
      }),
    );
    expect(result).toEqual({ sesionesRevocadas: 2, alcance: 'PROPIA' });
    expect(auditLogger.logSesionRevocada).toHaveBeenCalledWith(
      expect.objectContaining({ alcance: 'PROPIA' }),
    );
  });

  it('revocarPorUsuario logs the obfuscated target and alcance USUARIO', async () => {
    const result = await controller.revocarPorUsuario(
      { identificadorSso: '15079', motivo: 'credenciales comprometidas' },
      request(1),
    );

    expect(result).toEqual({ sesionesRevocadas: 2, alcance: 'USUARIO' });
    expect(auditLogger.logSesionRevocada).toHaveBeenCalledWith(
      expect.objectContaining({ alcance: 'USUARIO', objetivo: '15079' }),
    );
  });

  it('revocarTodas preserves the current session by default', async () => {
    const result = await controller.revocarTodas(
      { confirmacion: 'REVOCAR_TODAS_LAS_SESIONES', motivo: 'compromiso IdP' },
      request(7),
    );

    expect(refreshTokenService.revokeAllSessions).toHaveBeenCalledWith(
      RevocacionMotivo.REVOCACION_GLOBAL,
      7,
    );
    expect(result).toEqual({ sesionesRevocadas: 4, alcance: 'GLOBAL' });
  });

  it('revocarTodas can also close the operator session when opted out', async () => {
    await controller.revocarTodas(
      {
        confirmacion: 'REVOCAR_TODAS_LAS_SESIONES',
        motivo: 'compromiso IdP',
        preservarSesionActual: false,
      },
      request(7),
    );

    expect(refreshTokenService.revokeAllSessions).toHaveBeenCalledWith(
      RevocacionMotivo.REVOCACION_GLOBAL,
      undefined,
    );
  });
});
