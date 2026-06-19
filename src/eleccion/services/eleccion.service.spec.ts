import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UnprocessableEntityException } from '@nestjs/common';
import { EleccionesService } from '@/eleccion/services/eleccion.service';
import { ELECCION_REPOSITORY } from '@/eleccion/interfaces/eleccion.repository.interface';
import { EleccionEstado } from '@/eleccion/enums/eleccion-estado.enum';
import { Eleccion } from '@/eleccion/entities/eleccion.entity';
import { ConfiguracionDatosCandidatoService } from '@/eleccion/candidato/services/configuracion-datos-candidato.service';

const mockEleccionRepository = {
  crear: jest.fn(),
};

const mockEleccionOrmRepository = {
  findOne: jest.fn(),
  find: jest.fn(),
};

const mockConfigService = {
  crearConfiguracionPorDefecto: jest.fn(),
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
          provide: ConfiguracionDatosCandidatoService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<EleccionesService>(EleccionesService);
  });

  afterEach(() => jest.clearAllMocks());

  it('UAT-01: debe crear un comicio en estado BORRADOR con fechas futuras válidas', async () => {
    const dto = {
      nombre: 'Elección 2026',
      fechaInicio: new Date(Date.now() + 86400000).toISOString(),
      fechaFin: new Date(Date.now() + 172800000).toISOString(),
    };

    const eleccionMock = { ...dto, estado: EleccionEstado.BORRADOR, idEleccion: 1 };
    mockEleccionRepository.crear.mockResolvedValue(eleccionMock);
    mockConfigService.crearConfiguracionPorDefecto.mockResolvedValue({});

    const result = await service.crearEleccion(dto as any);

    expect(result.estado).toBe(EleccionEstado.BORRADOR);
    expect(mockEleccionRepository.crear).toHaveBeenCalledTimes(1);
    expect(mockConfigService.crearConfiguracionPorDefecto).toHaveBeenCalledWith(1);
  });

  it('UAT-02: debe lanzar 422 si la fecha de cierre es anterior a la de inicio', async () => {
    const dto = {
      nombre: 'Elección 2026',
      fechaInicio: new Date(Date.now() + 172800000).toISOString(),
      fechaFin: new Date(Date.now() + 86400000).toISOString(),
    };

    await expect(service.crearEleccion(dto as any)).rejects.toThrow(
      UnprocessableEntityException,
    );
    expect(mockEleccionRepository.crear).not.toHaveBeenCalled();
  });

  it('debe listar todos los comicios ordenados por id descendente', async () => {
    const expectedElecciones = [{ idEleccion: 2 }, { idEleccion: 1 }];
    mockEleccionOrmRepository.find.mockResolvedValue(expectedElecciones);

    const result = await service.listarElecciones();

    expect(result).toEqual(expectedElecciones);
    expect(mockEleccionOrmRepository.find).toHaveBeenCalledWith({
      order: { idEleccion: 'DESC' },
    });
  });

  it('UAT-03: debe lanzar 422 si la fecha de inicio está en el pasado', async () => {
    const dto = {
      nombre: 'Elección 2026',
      fechaInicio: new Date(Date.now() - 86400000).toISOString(),
      fechaFin: new Date(Date.now() + 86400000).toISOString(),
    };

    await expect(service.crearEleccion(dto as any)).rejects.toThrow(
      UnprocessableEntityException,
    );
    expect(mockEleccionRepository.crear).not.toHaveBeenCalled();
  });

  it('UAT-04: debe lanzar 422 si la fecha de inicio es el momento presente', async () => {
    const dto = {
      nombre: 'Elección 2026',
      fechaInicio: new Date().toISOString(),
      fechaFin: new Date(Date.now() + 86400000).toISOString(),
    };

    await expect(service.crearEleccion(dto as any)).rejects.toThrow(
      UnprocessableEntityException,
    );
    expect(mockEleccionRepository.crear).not.toHaveBeenCalled();
  });
});
