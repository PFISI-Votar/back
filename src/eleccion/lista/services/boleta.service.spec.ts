import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { BoletaService } from '@/eleccion/lista/services/boleta.service';
import { Boleta } from '@/eleccion/lista/entities/boleta.entity';
import { Categoria } from '@/eleccion/lista/entities/categoria.entity';
import { Eleccion } from '@/eleccion/entities/eleccion.entity';
import { EstadoBoleta } from '@/eleccion/lista/enums/estado-boleta.enum';

describe('BoletaService', () => {
  let service: BoletaService;

  const mockBoletaRepository = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    findOneOrFail: jest.fn(),
  };

  const mockCategoriaRepository = {
    create: jest.fn(),
    save: jest.fn(),
  };

  const mockEleccionRepository = {
    findOne: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BoletaService,
        {
          provide: getRepositoryToken(Boleta),
          useValue: mockBoletaRepository,
        },
        {
          provide: getRepositoryToken(Categoria),
          useValue: mockCategoriaRepository,
        },
        {
          provide: getRepositoryToken(Eleccion),
          useValue: mockEleccionRepository,
        },
      ],
    }).compile();

    service = module.get<BoletaService>(BoletaService);
  });

  afterEach(() => jest.clearAllMocks());

  it('ensureBoleta no debe duplicar categoría General si ya existen roles', async () => {
    const existingBoleta = {
      idBoleta: 1,
      idEleccion: 1,
      categorias: [{ idCategoria: 1, nombre: 'Presidente', orden: 1 }],
    };
    mockBoletaRepository.findOne.mockResolvedValue(existingBoleta);

    const result = await service.ensureBoleta(1);

    expect(result.categorias).toHaveLength(1);
    expect(mockCategoriaRepository.save).not.toHaveBeenCalled();
  });

  it('crearBoletaConCategorias debe persistir roles dinámicos', async () => {
    const roles = [
      { nombre: 'Presidente', maximoPostulantes: 1 },
      { nombre: 'Vicepresidente', maximoPostulantes: 2 },
    ];
    const boleta = {
      idBoleta: 5,
      idEleccion: 1,
      estado: EstadoBoleta.BORRADOR,
    };
    mockBoletaRepository.create.mockReturnValue(boleta);
    mockBoletaRepository.save.mockResolvedValue(boleta);
    mockCategoriaRepository.create.mockImplementation(
      (data: Partial<Categoria>) => data as Categoria,
    );
    mockCategoriaRepository.save.mockResolvedValue([]);
    mockBoletaRepository.findOneOrFail.mockResolvedValue({
      ...boleta,
      categorias: roles.map((r, i) => ({
        idCategoria: i + 1,
        nombre: r.nombre,
        cantidadCargos: r.maximoPostulantes,
        orden: i + 1,
      })),
    });

    const result = await service.crearBoletaConCategorias(
      1,
      'Boleta — Test',
      roles,
    );

    expect(mockCategoriaRepository.save).toHaveBeenCalledTimes(1);
    expect(result.categorias).toHaveLength(2);
  });

  it('ensureBoleta debe lanzar 404 si la elección no existe', async () => {
    mockBoletaRepository.findOne.mockResolvedValue(null);
    mockEleccionRepository.findOne.mockResolvedValue(null);

    await expect(service.ensureBoleta(999)).rejects.toThrow(NotFoundException);
  });
});
