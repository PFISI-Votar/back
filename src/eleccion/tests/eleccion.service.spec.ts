import { Test, TestingModule } from '@nestjs/testing';
import { EleccionesService } from '../eleccion.service';
import { ELECCION_REPOSITORY } from '../intefaces/eleccion.repository.interface';
import { EleccionEstado } from '../enums/eleccion-estado.enum';
import { UnprocessableEntityException } from '@nestjs/common';

const mockEleccionRepository = {
  crear: jest.fn(),
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
      ],
    }).compile();

    service = module.get<EleccionesService>(EleccionesService);
  });

  afterEach(() => jest.clearAllMocks());

  it('UAT-01: debe crear un comicio en estado BORRADOR con fechas futuras válidas', async () => {
    const dto = {
      nombre: 'Elección 2026',
      fechaInicio: new Date(Date.now() + 86400000).toISOString(), // mañana
      fechaFin: new Date(Date.now() + 172800000).toISOString(),   // pasado mañana
    };

    const eleccionMock = { ...dto, estado: EleccionEstado.BORRADOR, idEleccion: 1 };
    mockEleccionRepository.crear.mockResolvedValue(eleccionMock);

    const result = await service.crearEleccion(dto as any);

    expect(result.estado).toBe(EleccionEstado.BORRADOR);
    expect(mockEleccionRepository.crear).toHaveBeenCalledTimes(1);
  });

  it('UAT-02: debe lanzar 422 si la fecha de cierre es anterior a la de inicio', async () => {
    const dto = {
      nombre: 'Elección 2026',
      fechaInicio: new Date(Date.now() + 172800000).toISOString(), // pasado mañana
      fechaFin: new Date(Date.now() + 86400000).toISOString(),     // mañana
    };

    await expect(service.crearEleccion(dto as any)).rejects.toThrow(
      UnprocessableEntityException,
    );
    expect(mockEleccionRepository.crear).not.toHaveBeenCalled();
  });

  it('UAT-03: debe lanzar 422 si la fecha de inicio está en el pasado', async () => {
    const dto = {
      nombre: 'Elección 2026',
      fechaInicio: new Date(Date.now() - 86400000).toISOString(), // ayer
      fechaFin: new Date(Date.now() + 86400000).toISOString(),    // mañana
    };

    await expect(service.crearEleccion(dto as any)).rejects.toThrow(
      UnprocessableEntityException,
    );
    expect(mockEleccionRepository.crear).not.toHaveBeenCalled();
  });
});