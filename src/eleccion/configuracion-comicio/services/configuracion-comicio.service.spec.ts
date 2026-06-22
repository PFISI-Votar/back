import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfiguracionComicioService } from '@/eleccion/configuracion-comicio/services/configuracion-comicio.service';
import { ConfiguracionComicio } from '@/eleccion/configuracion-comicio/entities/configuracion-comicio.entity';
import { MetodoAutenticacion } from '@/eleccion/configuracion-comicio/enums/metodo-autenticacion.enum';
import { CrearEleccionValidationException } from '@/eleccion/exceptions/crear-eleccion-validation.exception';

describe('ConfiguracionComicioService', () => {
  let service: ConfiguracionComicioService;

  const mockConfigRepository = {
    create: jest.fn(),
    save: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConfiguracionComicioService,
        {
          provide: getRepositoryToken(ConfiguracionComicio),
          useValue: mockConfigRepository,
        },
      ],
    }).compile();

    service = module.get<ConfiguracionComicioService>(
      ConfiguracionComicioService,
    );
  });

  afterEach(() => jest.clearAllMocks());

  it('UAT-04: debe lanzar 422 si no hay métodos de autenticación', () => {
    expect(() => service.assertMetodosAutenticacionValidos([])).toThrow(
      CrearEleccionValidationException,
    );
  });

  it('debe crear configuración inicial con métodos de autenticación', async () => {
    const metodos = [MetodoAutenticacion.SSO_INSTITUCIONAL];
    const configMock = {
      idConfiguracion: 1,
      idEleccion: 1,
      metodosAutenticacion: metodos,
    };
    mockConfigRepository.create.mockReturnValue(configMock);
    mockConfigRepository.save.mockResolvedValue(configMock);

    const result = await service.crearConfiguracionInicial(1, metodos);

    expect(result.metodosAutenticacion).toEqual(metodos);
    expect(mockConfigRepository.save).toHaveBeenCalledTimes(1);
  });
});
