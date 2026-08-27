import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLoggerService } from '@/audit/audit-logger.service';
import { AuthService } from '@/auth/services/auth.service';
import { AutogestionService } from '@/auth/services/autogestion.service';
import { JwksService } from '@/auth/services/jwks.service';
import { RefreshTokenService } from '@/auth/services/refresh-token.service';
import { TotpService } from '@/auth/services/totp.service';
import { AutoridadElectoral } from '@/auth/entities/autoridad-electoral.entity';
import { JwtRole } from '@/auth/enums/jwt-role.enum';
import { RolAutoridad } from '@/auth/enums/rol-autoridad.enum';

describe('AuthService', () => {
  let service: AuthService;
  const signAsyncMock = jest.fn().mockResolvedValue('signed-jwt');
  const verifyAsyncMock = jest.fn();
  let autoridadRepository: jest.Mocked<
    Pick<Repository<AutoridadElectoral>, 'findOne' | 'save'>
  >;

  const mockAutogestionService = {
    login: jest.fn(),
    fetchUsuario: jest.fn(),
  };

  const issueSessionMock = jest.fn().mockResolvedValue({
    refreshToken: 'refresh-token',
  });
  const rotateSessionMock = jest.fn();
  const revokeSessionMock = jest.fn();
  const logLoginMock = jest.fn().mockResolvedValue(undefined);
  const createSecretMock = jest.fn().mockReturnValue('BASE32SECRET');
  const buildOtpauthUrlMock = jest
    .fn()
    .mockReturnValue('otpauth://totp/VOTAR:admin@test');
  const verifyCodeMock = jest.fn();

  const baseAutoridad = (): AutoridadElectoral =>
    ({
      idAutoridad: 1,
      identificadorSso: '14988',
      email: 'admin@test.local',
      nombre: 'Bruno Lucarelli',
      rol: RolAutoridad.ELECTION_ADMIN,
      totpSecret: null,
      totpEnabled: false,
      fechaRegistro: new Date(),
    }) as AutoridadElectoral;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: AutogestionService, useValue: mockAutogestionService },
        {
          provide: JwtService,
          useValue: { signAsync: signAsyncMock, verifyAsync: verifyAsyncMock },
        },
        {
          provide: RefreshTokenService,
          useValue: {
            issueSession: issueSessionMock,
            rotateSession: rotateSessionMock,
            revokeSession: revokeSessionMock,
          },
        },
        {
          provide: JwksService,
          useValue: {
            assertCanIssueLocalAccessTokens: jest.fn(),
            isRemoteMode: jest.fn().mockReturnValue(false),
          },
        },
        {
          provide: AuditLoggerService,
          useValue: { logLogin: logLoginMock },
        },
        {
          provide: TotpService,
          useValue: {
            createSecret: createSecretMock,
            buildOtpauthUrl: buildOtpauthUrlMock,
            verifyCode: verifyCodeMock,
          },
        },
        {
          provide: getRepositoryToken(AutoridadElectoral),
          useValue: { findOne: jest.fn(), save: jest.fn() },
        },
      ],
    }).compile();

    service = module.get(AuthService);
    autoridadRepository = module.get(getRepositoryToken(AutoridadElectoral));
    jest.clearAllMocks();
    signAsyncMock.mockResolvedValue('signed-jwt');
    issueSessionMock.mockResolvedValue({ refreshToken: 'refresh-token' });
    logLoginMock.mockResolvedValue(undefined);
    createSecretMock.mockReturnValue('BASE32SECRET');
    buildOtpauthUrlMock.mockReturnValue('otpauth://totp/VOTAR:admin@test');
    autoridadRepository.save.mockImplementation(async (entity) => entity as AutoridadElectoral);
  });

  it('returns 2FA setup challenge for admin without totp enabled', async () => {
    mockAutogestionService.login.mockResolvedValue('hash123');
    mockAutogestionService.fetchUsuario.mockResolvedValue({
      persona: {
        legajo: '14988',
        nombre: 'Bruno',
        apellido: 'Lucarelli',
        email: 'admin@test.local',
      },
    });
    autoridadRepository.findOne.mockResolvedValue(baseAutoridad());

    const actualResult = await service.login({
      nick: '14988',
      password: 'secret',
    });

    expect(actualResult.kind).toBe('two_factor');
    if (actualResult.kind !== 'two_factor') {
      return;
    }
    expect(actualResult.twoFactor.status).toBe('setup_required');
    expect(actualResult.twoFactor.secret).toBe('BASE32SECRET');
    expect(actualResult.twoFactor.otpauthUrl).toContain('otpauth://');
    expect(issueSessionMock).not.toHaveBeenCalled();
    expect(autoridadRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        totpSecret: 'BASE32SECRET',
        totpEnabled: false,
      }),
    );
  });

  it('returns 2FA verification challenge for admin with totp enabled', async () => {
    mockAutogestionService.login.mockResolvedValue('hash123');
    mockAutogestionService.fetchUsuario.mockResolvedValue({
      persona: {
        legajo: '14988',
        nombre: 'Bruno',
        apellido: 'Lucarelli',
        email: 'admin@test.local',
      },
    });
    autoridadRepository.findOne.mockResolvedValue({
      ...baseAutoridad(),
      totpSecret: 'EXISTINGSECRET',
      totpEnabled: true,
    });

    const actualResult = await service.login({
      nick: '14988',
      password: 'secret',
    });

    expect(actualResult.kind).toBe('two_factor');
    if (actualResult.kind !== 'two_factor') {
      return;
    }
    expect(actualResult.twoFactor.status).toBe('verification_required');
    expect(actualResult.twoFactor.secret).toBeUndefined();
    expect(issueSessionMock).not.toHaveBeenCalled();
  });

  it('issues session for non-authority users without 2FA', async () => {
    mockAutogestionService.login.mockResolvedValue('hash123');
    mockAutogestionService.fetchUsuario.mockResolvedValue({
      persona: { legajo: '15079', nombre: 'Valentino', email: 'v@test.local' },
    });
    autoridadRepository.findOne.mockResolvedValue(null);

    const actualResult = await service.login({
      nick: '15079',
      password: 'secret',
    });

    expect(actualResult.kind).toBe('session');
    if (actualResult.kind !== 'session') {
      return;
    }
    expect(signAsyncMock).toHaveBeenCalledWith(
      expect.objectContaining({ role: JwtRole.VOTER }),
      expect.any(Object),
    );
    expect(actualResult.session.response.user.role).toBe(JwtRole.VOTER);
  });

  it('resolves ELECTION_ADMIN when authority is registered by legajo but login uses nick', async () => {
    mockAutogestionService.login.mockResolvedValue('hash123');
    mockAutogestionService.fetchUsuario.mockResolvedValue({
      persona: {
        legajo: '14988',
        nombre: 'Bruno',
        apellido: 'Lucarelli',
        email: 'admin@test.local',
      },
    });
    autoridadRepository.findOne.mockResolvedValue(baseAutoridad());

    const actualResult = await service.login({
      nick: 'bruno.lucarelli',
      password: 'secret',
    });

    expect(autoridadRepository.findOne).toHaveBeenCalledWith({
      where: [
        { identificadorSso: 'bruno.lucarelli' },
        { identificadorSso: '14988' },
      ],
    });
    expect(actualResult.kind).toBe('two_factor');
  });

  it('completes session after valid 2FA setup code', async () => {
    verifyAsyncMock.mockResolvedValue({
      sub: '14988',
      nick: '14988',
      email: 'admin@test.local',
      name: 'Bruno Lucarelli',
      purpose: '2fa_challenge',
      mode: 'setup',
    });
    autoridadRepository.findOne.mockResolvedValue({
      ...baseAutoridad(),
      totpSecret: 'BASE32SECRET',
      totpEnabled: false,
    });
    verifyCodeMock.mockReturnValue(true);

    const actualResult = await service.verifyTwoFactor(
      'challenge-token',
      '123456',
      { ipOrigen: '10.0.0.8' },
    );

    expect(autoridadRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ totpEnabled: true }),
    );
    expect(logLoginMock).toHaveBeenCalledWith({
      actorId: '14988',
      ipOrigen: '10.0.0.8',
      role: JwtRole.ELECTION_ADMIN,
    });
    expect(actualResult.response.user.role).toBe(JwtRole.ELECTION_ADMIN);
    expect(actualResult.refreshToken).toBe('refresh-token');
  });

  it('rejects invalid 2FA codes', async () => {
    verifyAsyncMock.mockResolvedValue({
      sub: '14988',
      nick: '14988',
      purpose: '2fa_challenge',
      mode: 'verify',
    });
    autoridadRepository.findOne.mockResolvedValue({
      ...baseAutoridad(),
      totpSecret: 'EXISTINGSECRET',
      totpEnabled: true,
    });
    verifyCodeMock.mockReturnValue(false);

    await expect(
      service.verifyTwoFactor('challenge-token', '000000'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(issueSessionMock).not.toHaveBeenCalled();
  });

  it('resets 2FA after confirming institutional password', async () => {
    autoridadRepository.findOne.mockResolvedValue({
      ...baseAutoridad(),
      totpSecret: 'EXISTINGSECRET',
      totpEnabled: true,
    });
    mockAutogestionService.login.mockResolvedValue('hash123');

    await service.resetTwoFactor(
      {
        sub: '14988',
        role: JwtRole.ELECTION_ADMIN,
        email: 'admin@test.local',
      },
      'secret',
    );

    expect(mockAutogestionService.login).toHaveBeenCalledWith(
      '14988',
      'secret',
    );
    expect(autoridadRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        totpSecret: null,
        totpEnabled: false,
      }),
    );
  });

  it('revalidates authority role when refreshing session', async () => {
    rotateSessionMock.mockResolvedValue({
      refreshToken: 'next-refresh-token',
      identity: {
        identificadorSso: '14988',
        sub: '14988',
        email: 'admin@test.local',
        name: 'Admin',
      },
    });
    autoridadRepository.findOne.mockResolvedValue({
      ...baseAutoridad(),
      totpEnabled: true,
      totpSecret: 'SECRET',
    });

    const actualResult = await service.refreshSession('refresh-token');

    expect(rotateSessionMock).toHaveBeenCalledWith('refresh-token');
    expect(actualResult.response.user.role).toBe(JwtRole.ELECTION_ADMIN);
    expect(actualResult.refreshToken).toBe('next-refresh-token');
  });
});
