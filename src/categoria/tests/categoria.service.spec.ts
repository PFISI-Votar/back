import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CategoriasService } from '../categoria.service';
import { CATEGORIA_REPOSITORY } from '../interfaces/categoria.repository.interface';
import { Eleccion } from '../../eleccion/entities/eleccion.entity';
import { EleccionEstado } from '../../eleccion/enums/eleccion-estado.enum';
import {
  BadRequestException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { CrearCategoriaDto } from '../dto/crear-categoria.dto';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockCategoriaRepository = {
  crear: jest.fn(),
  actualizar: jest.fn(),
  eliminar: jest.fn(),
  findByEleccion: jest.fn(),
  findById: jest.fn(),
  findByIdAndEleccion: jest.fn(),
  tieneCeroListasOficializadas: jest.fn(),
  obtenerMaximoUsoEnLista: jest.fn(),
  contarCandidatos: jest.fn(),
};

const mockEleccionOrmRepository = {
  findOne: jest.fn(),
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const eleccionBorrador = {
  idEleccion: 1,
  nombre: 'Elección 2026',
  estado: EleccionEstado.BORRADOR,
};

const eleccionConfigurada = {
  idEleccion: 2,
  nombre: 'Elección Oficializada',
  estado: EleccionEstado.CONFIGURADA,
};

const dto: CrearCategoriaDto = {
  nombre: 'Presidente',
  descripcion: 'Cargo principal',
  minimoPostulantes: 0,
  maximoPostulantes: 1,
  orden: 1,
};

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('CategoriasService', () => {
  let service: CategoriasService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CategoriasService,
        { provide: CATEGORIA_REPOSITORY, useValue: mockCategoriaRepository },
        {
          provide: getRepositoryToken(Eleccion),
          useValue: mockEleccionOrmRepository,
        },
      ],
    }).compile();

    service = module.get<CategoriasService>(CategoriasService);
  });

  afterEach(() => jest.clearAllMocks());

  // ── crearCategoria ──────────────────────────────────────────────────────────

  describe('crearCategoria', () => {
    it('UAT-01: debe crear la categoría en un comicio BORRADOR y retornarla con id asignado', async () => {
      const categoriaCreada = { idCategoria: 1, idEleccion: 1, ...dto };
      mockEleccionOrmRepository.findOne.mockResolvedValue(eleccionBorrador);
      mockCategoriaRepository.crear.mockResolvedValue(categoriaCreada);

      const result = await service.crearCategoria(1, dto);

      expect(result.idCategoria).toBe(1);
      expect(mockCategoriaRepository.crear).toHaveBeenCalledWith(1, dto);
    });

    it('UAT-01b: debe aceptar nombre con exactamente 100 caracteres', async () => {
      const dtoLargo: CrearCategoriaDto = { ...dto, nombre: 'A'.repeat(100) };
      const categoriaCreada = { idCategoria: 2, idEleccion: 1, ...dtoLargo };
      mockEleccionOrmRepository.findOne.mockResolvedValue(eleccionBorrador);
      mockCategoriaRepository.crear.mockResolvedValue(categoriaCreada);

      const result = await service.crearCategoria(1, dtoLargo);

      expect(result).toBeDefined();
    });

    it('UAT-02: debe lanzar 422 si el comicio ya fue oficializado (estado CONFIGURADA)', async () => {
      mockEleccionOrmRepository.findOne.mockResolvedValue(eleccionConfigurada);

      await expect(service.crearCategoria(2, dto)).rejects.toThrow(
        UnprocessableEntityException,
      );
      expect(mockCategoriaRepository.crear).not.toHaveBeenCalled();
    });

    it('UAT-02b: debe lanzar 422 si el comicio está ABIERTA', async () => {
      mockEleccionOrmRepository.findOne.mockResolvedValue({
        ...eleccionBorrador,
        estado: EleccionEstado.ABIERTA,
      });

      await expect(service.crearCategoria(1, dto)).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    it('debe lanzar 404 si la elección no existe', async () => {
      mockEleccionOrmRepository.findOne.mockResolvedValue(null);

      await expect(service.crearCategoria(99, dto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('debe lanzar 400 si el nombre queda vacío tras la sanitización', async () => {
      const dtoVacio: CrearCategoriaDto = { ...dto, nombre: '' };
      mockEleccionOrmRepository.findOne.mockResolvedValue(eleccionBorrador);

      await expect(service.crearCategoria(1, dtoVacio)).rejects.toThrow(
        BadRequestException,
      );
      expect(mockCategoriaRepository.crear).not.toHaveBeenCalled();
    });
  });

  // ── listarCategorias ────────────────────────────────────────────────────────

  describe('listarCategorias', () => {
    it('debe retornar el listado de categorías de la elección ordenado por orden ASC', async () => {
      const categorias = [
        { idCategoria: 1, nombre: 'Presidente', orden: 1 },
        { idCategoria: 2, nombre: 'Vocales', orden: 2 },
      ];
      mockEleccionOrmRepository.findOne.mockResolvedValue(eleccionBorrador);
      mockCategoriaRepository.findByEleccion.mockResolvedValue(categorias);

      const result = await service.listarCategorias(1);

      expect(result).toHaveLength(2);
      expect(result[0].nombre).toBe('Presidente');
    });

    it('debe retornar array vacío si la elección no tiene categorías', async () => {
      mockEleccionOrmRepository.findOne.mockResolvedValue(eleccionBorrador);
      mockCategoriaRepository.findByEleccion.mockResolvedValue([]);

      const result = await service.listarCategorias(1);

      expect(result).toEqual([]);
    });

    it('debe lanzar 404 si la elección no existe', async () => {
      mockEleccionOrmRepository.findOne.mockResolvedValue(null);

      await expect(service.listarCategorias(99)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ── validarCategoriasParaOficializar ────────────────────────────────────────

  describe('validarCategoriasParaOficializar', () => {
    it('UAT-02 (CA-3): debe lanzar 422 si existe al menos una categoría sin listas oficializadas', async () => {
      mockCategoriaRepository.findByEleccion.mockResolvedValue([
        { idCategoria: 1, nombre: 'Presidente' },
      ]);
      mockCategoriaRepository.tieneCeroListasOficializadas.mockResolvedValue(
        true,
      );

      await expect(service.validarCategoriasParaOficializar(1)).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    it('debe lanzar 422 si el comicio no tiene ninguna categoría registrada', async () => {
      mockCategoriaRepository.findByEleccion.mockResolvedValue([]);

      await expect(service.validarCategoriasParaOficializar(1)).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    it('no debe lanzar error si todas las categorías tienen al menos una lista oficializada', async () => {
      mockCategoriaRepository.findByEleccion.mockResolvedValue([
        { idCategoria: 1, nombre: 'Presidente' },
      ]);
      mockCategoriaRepository.tieneCeroListasOficializadas.mockResolvedValue(
        false,
      );

      await expect(
        service.validarCategoriasParaOficializar(1),
      ).resolves.not.toThrow();
    });
  });
});
