import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthService } from '@/auth/services/auth.service';
import { AutogestionService } from '@/auth/services/autogestion.service';
import { JwksService } from '@/auth/services/jwks.service';
import { RefreshTokenService } from '@/auth/services/refresh-token.service';
import { AutoridadElectoral } from '@/auth/entities/autoridad-electoral.entity';
import { JwtRole } from '@/auth/enums/jwt-role.enum';
import { RolAutoridad } from '@/auth/enums/rol-autoridad.enum';

describe('AuthService', () => {
  let service: AuthService;
  const signAsyncMock = jest.fn().mockResolvedValue('signed-jwt');
  let autoridadRepository: jest.Mocked<
    Pick<Repository<AutoridadElectoral>, 'findOne'>
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

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: AutogestionService, useValue: mockAutogestionService },
        {
          provide: JwtService,
          useValue: { signAsync: signAsyncMock },
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
          provide: getRepositoryToken(AutoridadElectoral),
          useValue: { findOne: jest.fn() },
        },
      ],
    }).compile();

    service = module.get(AuthService);
    autoridadRepository = module.get(getRepositoryToken(AutoridadElectoral));
    jest.clearAllMocks();
    signAsyncMock.mockResolvedValue('signed-jwt');
    issueSessionMock.mockResolvedValue({ refreshToken: 'refresh-token' });
  });

  it('issues access and refresh tokens for ELECTION_ADMIN authority', async () => {
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
      idAutoridad: 1,
      identificadorSso: '14988',
      email: 'admin@test.local',
      nombre: 'Bruno Lucarelli',
      rol: RolAutoridad.ELECTION_ADMIN,
      fechaRegistro: new Date(),
    });

    const actualResult = await service.login({
      nick: '14988',
      password: 'secret',
    });

    expect(signAsyncMock).toHaveBeenCalledWith(
      expect.objectContaining({
        sub: '14988',
        role: JwtRole.ELECTION_ADMIN,
      }),
    );
    expect(issueSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({ identificadorSso: '14988' }),
    );
    expect(actualResult.response.accessToken).toBe('signed-jwt');
    expect(actualResult.refreshToken).toBe('refresh-token');
    expect(actualResult.response.user.role).toBe(JwtRole.ELECTION_ADMIN);
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
    autoridadRepository.findOne.mockResolvedValue({
      idAutoridad: 1,
      identificadorSso: '14988',
      email: 'admin@test.local',
      nombre: 'Bruno Lucarelli',
      rol: RolAutoridad.ELECTION_ADMIN,
      fechaRegistro: new Date(),
    });

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
    expect(actualResult.response.user.role).toBe(JwtRole.ELECTION_ADMIN);
  });

  it('issues voter role when user is not an authority', async () => {
    mockAutogestionService.login.mockResolvedValue('hash123');
    mockAutogestionService.fetchUsuario.mockResolvedValue({
      persona: { legajo: '15079', nombre: 'Valentino', email: 'v@test.local' },
    });
    autoridadRepository.findOne.mockResolvedValue(null);

    const actualResult = await service.login({
      nick: '15079',
      password: 'secret',
    });

    expect(signAsyncMock).toHaveBeenCalledWith(
      expect.objectContaining({ role: JwtRole.VOTER }),
    );
    expect(actualResult.response.user.role).toBe(JwtRole.VOTER);
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
      idAutoridad: 1,
      identificadorSso: '14988',
      email: 'admin@test.local',
      nombre: 'Admin',
      rol: RolAutoridad.ELECTION_ADMIN,
      fechaRegistro: new Date(),
    });

    const actualResult = await service.refreshSession('refresh-token');

    expect(rotateSessionMock).toHaveBeenCalledWith('refresh-token');
    expect(actualResult.response.user.role).toBe(JwtRole.ELECTION_ADMIN);
    expect(actualResult.refreshToken).toBe('next-refresh-token');
  });
});
