import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EleccionesService } from '@/eleccion/services/eleccion.service';
import { ELECCION_REPOSITORY } from '@/eleccion/interfaces/eleccion.repository.interface';
import { EleccionEstado } from '@/eleccion/enums/eleccion-estado.enum';
import { TipoVotacion } from '@/eleccion/enums/tipo-votacion.enum';
import { Eleccion } from '@/eleccion/entities/eleccion.entity';
import { ConfiguracionComicio } from '@/eleccion/configuracion-comicio/entities/configuracion-comicio.entity';
import { ConfiguracionComicioService } from '@/eleccion/configuracion-comicio/services/configuracion-comicio.service';
import { MetodoAutenticacion } from '@/eleccion/configuracion-comicio/enums/metodo-autenticacion.enum';
import { Boleta } from '@/eleccion/lista/entities/boleta.entity';
import { Categoria } from '@/eleccion/lista/entities/categoria.entity';
import { CrearEleccionDto } from '@/eleccion/dto/crear-eleccion.dto';
import { CrearEleccionValidationException } from '@/eleccion/exceptions/crear-eleccion-validation.exception';

const buildValidDto = (): CrearEleccionDto => ({
  nombre: 'Elección 2026',
  fechaInicio: new Date(Date.now() + 86400000).toISOString(),
  fechaFin: new Date(Date.now() + 172800000).toISOString(),
  tipoVotacion: TipoVotacion.POR_LISTA,
  roles: [{ nombre: 'Presidente', maximoPostulantes: 1 }],
  metodosAutenticacion: [MetodoAutenticacion.SSO_INSTITUCIONAL],
});

const mockEleccionRepository = {
  crearCompleta: jest.fn(),
};

const mockEleccionOrmRepository = {
  findOne: jest.fn(),
  find: jest.fn(),
};

const mockConfigComicioOrmRepository = {
  findOne: jest.fn(),
};

const mockBoletaOrmRepository = {
  findOne: jest.fn(),
};

const mockCategoriaOrmRepository = {
  find: jest.fn(),
};

const mockConfigComicioService = {
  assertMetodosAutenticacionValidos: jest.fn(),
};

describe('EleccionesService', () => {
  let service: EleccionesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EleccionesService,
        {
          provide: ELECCION_REPOSITORY,
          useValue: mockEleccionRepository,
        },
        {
          provide: getRepositoryToken(Eleccion),
          useValue: mockEleccionOrmRepository,
        },
        {
          provide: getRepositoryToken(ConfiguracionComicio),
          useValue: mockConfigComicioOrmRepository,
        },
        {
          provide: getRepositoryToken(Boleta),
          useValue: mockBoletaOrmRepository,
        },
        {
          provide: getRepositoryToken(Categoria),
          useValue: mockCategoriaOrmRepository,
        },
        {
          provide: ConfiguracionComicioService,
          useValue: mockConfigComicioService,
        },
      ],
    }).compile();

    service = module.get<EleccionesService>(EleccionesService);
  });

  afterEach(() => jest.clearAllMocks());

  it('UAT-01: debe crear un comicio en estado BORRADOR con payload completo', async () => {
    const dto = buildValidDto();
    const eleccionMock = {
      idEleccion: 1,
      nombre: dto.nombre,
      estado: EleccionEstado.BORRADOR,
      tipoVotacion: dto.tipoVotacion,
      fechaInicio: new Date(dto.fechaInicio),
      fechaFin: new Date(dto.fechaFin),
      descripcion: null,
    };
    const categoriasMock = [
      {
        idCategoria: 1,
        nombre: 'Presidente',
        cantidadCargos: 1,
        orden: 1,
      },
    ];
    mockEleccionRepository.crearCompleta.mockResolvedValue({
      eleccion: eleccionMock,
      categorias: categoriasMock,
      metodosAutenticacion: dto.metodosAutenticacion,
    });

    const result = await service.crearEleccion(dto);

    expect(result.estado).toBe(EleccionEstado.BORRADOR);
    expect(result.tipoVotacion).toBe(TipoVotacion.POR_LISTA);
    expect(result.roles).toHaveLength(1);
    expect(result.metodosAutenticacion).toEqual(dto.metodosAutenticacion);
    expect(mockEleccionRepository.crearCompleta).toHaveBeenCalledWith(dto);
    expect(
      mockConfigComicioService.assertMetodosAutenticacionValidos,
    ).toHaveBeenCalledWith(dto.metodosAutenticacion);
  });

  it('UAT-02: debe lanzar 422 si la fecha de cierre es anterior a la de inicio', async () => {
    const dto = buildValidDto();
    dto.fechaInicio = new Date(Date.now() + 172800000).toISOString();
    dto.fechaFin = new Date(Date.now() + 86400000).toISOString();

    await expect(service.crearEleccion(dto)).rejects.toThrow(
      CrearEleccionValidationException,
    );
    expect(mockEleccionRepository.crearCompleta).not.toHaveBeenCalled();
  });

  it('UAT-03: debe lanzar 422 si la fecha de inicio está en el pasado', async () => {
    const dto = buildValidDto();
    dto.fechaInicio = new Date(Date.now() - 86400000).toISOString();

    await expect(service.crearEleccion(dto)).rejects.toThrow(
      CrearEleccionValidationException,
    );
    expect(mockEleccionRepository.crearCompleta).not.toHaveBeenCalled();
  });

  it('debe lanzar 422 si la fecha de cierre está en el pasado', async () => {
    const dto = buildValidDto();
    dto.fechaInicio = new Date(Date.now() + 172800000).toISOString();
    dto.fechaFin = new Date(Date.now() - 86400000).toISOString();

    await expect(service.crearEleccion(dto)).rejects.toThrow(
      CrearEleccionValidationException,
    );
    expect(mockEleccionRepository.crearCompleta).not.toHaveBeenCalled();
  });

  it('debe lanzar 422 si la fecha de inicio es el momento presente', async () => {
    const dto = buildValidDto();
    dto.fechaInicio = new Date().toISOString();

    await expect(service.crearEleccion(dto)).rejects.toThrow(
      CrearEleccionValidationException,
    );
    expect(mockEleccionRepository.crearCompleta).not.toHaveBeenCalled();
  });

  it('UAT-04a: debe lanzar 422 si no hay roles de candidato', async () => {
    const dto = buildValidDto();
    dto.roles = [];

    await expect(service.crearEleccion(dto)).rejects.toThrow(
      CrearEleccionValidationException,
    );
    expect(mockEleccionRepository.crearCompleta).not.toHaveBeenCalled();
  });

  it('UAT-04b: debe lanzar 422 si no hay métodos de autenticación', async () => {
    const dto = buildValidDto();
    mockConfigComicioService.assertMetodosAutenticacionValidos.mockImplementation(
      () => {
        throw new CrearEleccionValidationException([
          {
            field: 'metodosAutenticacion',
            message:
              'Debe definir al menos un método de inicio de sesión activo.',
          },
        ]);
      },
    );

    await expect(service.crearEleccion(dto)).rejects.toThrow(
      CrearEleccionValidationException,
    );
    expect(mockEleccionRepository.crearCompleta).not.toHaveBeenCalled();
  });

  it('debe listar todos los comicios ordenados por id descendente', async () => {
    const eleccion = {
      idEleccion: 2,
      nombre: 'Test',
      estado: EleccionEstado.BORRADOR,
      tipoVotacion: TipoVotacion.POR_LISTA,
      fechaInicio: new Date(),
      fechaFin: new Date(),
      descripcion: null,
    };
    mockEleccionOrmRepository.find.mockResolvedValue([eleccion]);
    mockConfigComicioOrmRepository.findOne.mockResolvedValue({
      metodosAutenticacion: [MetodoAutenticacion.GOOGLE],
    });
    mockBoletaOrmRepository.findOne.mockResolvedValue({ idBoleta: 10 });
    mockCategoriaOrmRepository.find.mockResolvedValue([]);

    const result = await service.listarElecciones();

    expect(result).toHaveLength(1);
    expect(mockEleccionOrmRepository.find).toHaveBeenCalledWith({
      order: { idEleccion: 'DESC' },
    });
  });

  it('no debe inyectar dependencias blockchain en el servicio de creación', () => {
    const constructorParamTypes: unknown[] =
      Reflect.getMetadata('design:paramtypes', EleccionesService) ?? [];
    const hasBlockchainProvider = constructorParamTypes.some((type) => {
      const name =
        typeof type === 'function'
          ? (type as { name?: string }).name ?? ''
          : '';
      return /blockchain|web3|ethereum|sepolia/i.test(name);
    });
    expect(hasBlockchainProvider).toBe(false);
  });
});
