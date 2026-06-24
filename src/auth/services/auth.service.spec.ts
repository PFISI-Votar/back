import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthService } from '@/auth/services/auth.service';
import { AutogestionService } from '@/auth/services/autogestion.service';
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
          provide: getRepositoryToken(AutoridadElectoral),
          useValue: { findOne: jest.fn() },
        },
      ],
    }).compile();

    service = module.get(AuthService);
    autoridadRepository = module.get(getRepositoryToken(AutoridadElectoral));
    jest.clearAllMocks();
    signAsyncMock.mockResolvedValue('signed-jwt');
  });

  it('issues JWT with role election_admin for ELECTION_ADMIN authority', async () => {
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
      emailInstitucional: 'admin@test.local',
      nombre: 'Bruno Lucarelli',
      rol: RolAutoridad.ELECTION_ADMIN,
      fechaRegistro: new Date(),
    });

    const actualResponse = await service.login({
      nick: '14988',
      password: 'secret',
    });

    expect(signAsyncMock).toHaveBeenCalledWith(
      expect.objectContaining({
        sub: '14988',
        role: JwtRole.ELECTION_ADMIN,
      }),
    );
    expect(actualResponse.accessToken).toBe('signed-jwt');
    expect(actualResponse.user.role).toBe(JwtRole.ELECTION_ADMIN);
  });

  it('issues JWT with role voter when user is not an authority', async () => {
    mockAutogestionService.login.mockResolvedValue('hash123');
    mockAutogestionService.fetchUsuario.mockResolvedValue({
      persona: { legajo: '15079', nombre: 'Valentino', email: 'v@test.local' },
    });
    autoridadRepository.findOne.mockResolvedValue(null);

    const actualResponse = await service.login({
      nick: '15079',
      password: 'secret',
    });

    expect(signAsyncMock).toHaveBeenCalledWith(
      expect.objectContaining({ role: JwtRole.VOTER }),
    );
    expect(actualResponse.user.role).toBe(JwtRole.VOTER);
  });
});
