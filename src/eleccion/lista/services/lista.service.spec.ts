import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BoletaService } from '@/eleccion/lista/services/boleta.service';
import { ListaService } from '@/eleccion/lista/services/lista.service';
import { Eleccion } from '@/eleccion/entities/eleccion.entity';
import { Lista } from '@/eleccion/lista/entities/lista.entity';
import { EleccionEstado } from '@/eleccion/enums/eleccion-estado.enum';
import { EstadoLista } from '@/eleccion/lista/enums/estado-lista.enum';
import { ElectoralImageService } from '@/common/images/electoral-image.service';

const mockEleccion: Eleccion = {
  idEleccion: 1,
  nombre: 'Comicio Test',
  descripcion: null,
  fechaInicio: new Date('2026-12-01'),
  fechaFin: new Date('2026-12-02'),
  estado: EleccionEstado.BORRADOR,
  minimoCandidatosPorLista: null,
  fechaCreacion: new Date(),
  fechaActualizacion: new Date(),
};

const mockBoleta = {
  idBoleta: 10,
  idEleccion: 1,
  titulo: 'Boleta',
  categorias: [{ idCategoria: 1, idBoleta: 10, nombre: 'General', orden: 1 }],
};

describe('ListaService', () => {
  let service: ListaService;

  const mockListaRepository = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    remove: jest.fn(),
  };

  const mockEleccionRepository = {
    findOne: jest.fn(),
  };

  const mockBoletaService = {
    ensureBoleta: jest.fn(),
    findBoletaByEleccion: jest.fn(),
  };

  const mockElectoralImageService = {
    saveImage: jest.fn(),
    deleteIfManagedUrl: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ListaService,
        { provide: getRepositoryToken(Lista), useValue: mockListaRepository },
        {
          provide: getRepositoryToken(Eleccion),
          useValue: mockEleccionRepository,
        },
        { provide: BoletaService, useValue: mockBoletaService },
        { provide: ElectoralImageService, useValue: mockElectoralImageService },
      ],
    }).compile();

    service = module.get<ListaService>(ListaService);
  });

  afterEach(() => jest.clearAllMocks());

  it('UAT-01: debe crear una lista en comicio BORRADOR', async () => {
    mockEleccionRepository.findOne.mockResolvedValue(mockEleccion);
    mockBoletaService.ensureBoleta.mockResolvedValue(mockBoleta);
    const savedLista = {
      idLista: 1,
      idBoleta: 10,
      nombre: 'Lista A',
      sigla: 'LA',
      color: '#2563eb',
      estado: EstadoLista.BORRADOR,
      listId: null,
      fechaOficializacion: null,
    };
    mockListaRepository.create.mockReturnValue(savedLista);
    mockListaRepository.save.mockResolvedValue(savedLista);

    const result = await service.create(1, {
      nombre: 'Lista A',
      sigla: 'LA',
      color: '#2563eb',
    });

    expect(result.nombre).toBe('Lista A');
    expect(mockListaRepository.save).toHaveBeenCalled();
  });

  it('UAT-02: debe lanzar 409 al actualizar lista en comicio CONFIGURADA', async () => {
    const listaOficializada = {
      idLista: 1,
      idBoleta: 10,
      nombre: 'Lista A',
      sigla: 'LA',
      color: null,
      estado: EstadoLista.OFICIALIZADA,
      boleta: {
        eleccion: { ...mockEleccion, estado: EleccionEstado.CONFIGURADA },
      },
    };
    mockListaRepository.findOne.mockResolvedValue(listaOficializada);

    await expect(service.update(1, { nombre: 'Nuevo nombre' })).rejects.toThrow(
      ConflictException,
    );
  });

  it('debe lanzar 404 si la elección no existe', async () => {
    mockEleccionRepository.findOne.mockResolvedValue(null);

    await expect(
      service.create(999, { nombre: 'X', sigla: 'X' }),
    ).rejects.toThrow(NotFoundException);
  });
});
