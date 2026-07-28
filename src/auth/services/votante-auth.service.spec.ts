import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UnauthorizedException } from '@nestjs/common';
import { VotanteAuthService } from '@/auth/services/votante-auth.service';
import { AutogestionService } from '@/auth/services/autogestion.service';
import { JwksService } from '@/auth/services/jwks.service';
import { PadronEligibilityService } from '@/padron/services/padron-eligibility.service';
import { Eleccion } from '@/eleccion/entities/eleccion.entity';
import { ConfiguracionComicio } from '@/eleccion/configuracion-comicio/entities/configuracion-comicio.entity';
import { JwtRole } from '@/auth/enums/jwt-role.enum';
import { MetodoAutenticacion } from '@/eleccion/configuracion-comicio/enums/metodo-autenticacion.enum';
import { VOTANTE_CREDENCIALES_INVALIDAS } from '@/auth/constants/votante-auth.constants';
import { hashVotante } from '@/padron/utils/keccak.util';

describe('VotanteAuthService', () => {
  let service: VotanteAuthService;
  const signAsyncMock = jest.fn().mockResolvedValue('signed-voter-jwt');
  let eleccionRepository: jest.Mocked<Pick<Repository<Eleccion>, 'findOne'>>;
  let configuracionRepository: jest.Mocked<
    Pick<Repository<ConfiguracionComicio>, 'findOne'>
  >;

  const mockAutogestionService = {
    login: jest.fn(),
    fetchUsuario: jest.fn(),
  };

  const mockPadronEligibilityService = {
    isVotanteHabilitado: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VotanteAuthService,
        { provide: AutogestionService, useValue: mockAutogestionService },
        {
          provide: JwtService,
          useValue: { signAsync: signAsyncMock },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) =>
              key === 'JWT_VOTER_ACCESS_EXPIRES_IN' ? '30m' : undefined,
            ),
          },
        },
        {
          provide: PadronEligibilityService,
          useValue: mockPadronEligibilityService,
        },
        {
          provide: JwksService,
          useValue: {
            assertCanIssueLocalAccessTokens: jest.fn(),
            isRemoteMode: jest.fn().mockReturnValue(false),
          },
        },
        {
          provide: getRepositoryToken(Eleccion),
          useValue: { findOne: jest.fn() },
        },
        {
          provide: getRepositoryToken(ConfiguracionComicio),
          useValue: { findOne: jest.fn() },
        },
      ],
    }).compile();

    service = module.get(VotanteAuthService);
    eleccionRepository = module.get(getRepositoryToken(Eleccion));
    configuracionRepository = module.get(
      getRepositoryToken(ConfiguracionComicio),
    );
    jest.clearAllMocks();
    signAsyncMock.mockResolvedValue('signed-voter-jwt');
    eleccionRepository.findOne.mockResolvedValue({
      idEleccion: 1,
    } as Eleccion);
    configuracionRepository.findOne.mockResolvedValue({
      metodosAutenticacion: [MetodoAutenticacion.SSO_INSTITUCIONAL],
    } as ConfiguracionComicio);
  });

  it('issues JWT with role voter for eligible padron member', async () => {
    const inputDni = '30111222';
    const inputEmail = 'ana@frvm.utn.edu.ar';
    const expectedHash = hashVotante(inputDni, inputEmail);
    mockAutogestionService.login.mockResolvedValue('hash123');
    mockAutogestionService.fetchUsuario.mockResolvedValue({
      persona: {
        legajo: '14988',
        nombre: 'Ana',
        apellido: 'López',
        email: inputEmail,
        dni: inputDni,
      },
    });
    mockPadronEligibilityService.isVotanteHabilitado.mockResolvedValue(true);

    const actualResult = await service.login({
      nick: '14988',
      password: 'secret',
      idEleccion: 1,
    });

    expect(signAsyncMock).toHaveBeenCalledWith(
      expect.objectContaining({
        sub: '14988',
        role: JwtRole.VOTER,
        votanteHash: expectedHash,
        idEleccion: 1,
      }),
      expect.objectContaining({ expiresIn: '30m' }),
    );
    expect(actualResult.accessToken).toBe('signed-voter-jwt');
    expect(actualResult.user.role).toBe(JwtRole.VOTER);
  });

  it('rejects login when votante is not on padron with generic message', async () => {
    mockAutogestionService.login.mockResolvedValue('hash123');
    mockAutogestionService.fetchUsuario.mockResolvedValue({
      persona: {
        legajo: '14988',
        email: 'ana@frvm.utn.edu.ar',
        dni: '30111222',
      },
    });
    mockPadronEligibilityService.isVotanteHabilitado.mockResolvedValue(false);

    await expect(
      service.login({ nick: '14988', password: 'secret', idEleccion: 1 }),
    ).rejects.toThrow(
      new UnauthorizedException(VOTANTE_CREDENCIALES_INVALIDAS),
    );
  });

  it('rejects login when SSO institucional is not enabled', async () => {
    configuracionRepository.findOne.mockResolvedValue({
      metodosAutenticacion: [MetodoAutenticacion.GOOGLE],
    } as ConfiguracionComicio);

    await expect(
      service.login({ nick: '14988', password: 'secret', idEleccion: 1 }),
    ).rejects.toThrow(
      new UnauthorizedException(VOTANTE_CREDENCIALES_INVALIDAS),
    );
  });

  it('rejects login when persona has no dni', async () => {
    mockAutogestionService.login.mockResolvedValue('hash123');
    mockAutogestionService.fetchUsuario.mockResolvedValue({
      persona: { legajo: '14988', email: 'ana@frvm.utn.edu.ar' },
    });

    await expect(
      service.login({ nick: '14988', password: 'secret', idEleccion: 1 }),
    ).rejects.toThrow(
      new UnauthorizedException(VOTANTE_CREDENCIALES_INVALIDAS),
    );
  });
});
