import {
  ConflictException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CandidatoDatosValidatorService } from '@/eleccion/candidato/services/candidato-datos-validator.service';
import { CandidatoService } from '@/eleccion/candidato/services/candidato.service';
import { ConfiguracionDatosCandidatoService } from '@/eleccion/candidato/services/configuracion-datos-candidato.service';
import { ListaService } from '@/eleccion/lista/services/lista.service';
import { Candidato } from '@/eleccion/candidato/entities/candidato.entity';
import { Categoria } from '@/eleccion/lista/entities/categoria.entity';
import { EleccionEstado } from '@/eleccion/enums/eleccion-estado.enum';

const validDatos = {
  legajo_utn: '14988',
  dni: '40123456',
  cantidad_avales: 2,
};

describe('CandidatoService', () => {
  let service: CandidatoService;

  const mockQueryBuilder = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getCount: jest.fn().mockResolvedValue(0),
  };

  const mockCandidatoRepository = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    remove: jest.fn(),
    createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
  };

  const mockCategoriaRepository = {
    findOne: jest.fn(),
  };

  const mockListaService = {
    findListaWithEleccionOrFail: jest.fn(),
  };

  const mockConfigService = {
    obtenerCamposPorEleccion: jest.fn(),
  };

  const mockValidatorService = {
    validateDatosAdicionales: jest.fn(),
  };

  const mockListaContext = {
    idLista: 1,
    idBoleta: 10,
    boleta: {
      eleccion: { idEleccion: 1, estado: EleccionEstado.BORRADOR },
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CandidatoService,
        {
          provide: getRepositoryToken(Candidato),
          useValue: mockCandidatoRepository,
        },
        {
          provide: getRepositoryToken(Categoria),
          useValue: mockCategoriaRepository,
        },
        { provide: ListaService, useValue: mockListaService },
        {
          provide: ConfiguracionDatosCandidatoService,
          useValue: mockConfigService,
        },
        {
          provide: CandidatoDatosValidatorService,
          useValue: mockValidatorService,
        },
      ],
    }).compile();

    service = module.get<CandidatoService>(CandidatoService);
  });

  afterEach(() => jest.clearAllMocks());

  it('UAT-01: debe crear candidato con datos adicionales válidos', async () => {
    mockListaService.findListaWithEleccionOrFail.mockResolvedValue(
      mockListaContext,
    );
    mockCategoriaRepository.findOne.mockResolvedValue({
      idCategoria: 1,
      idBoleta: 10,
      cantidadCargos: 3,
      nombre: 'Presidente',
    });
    mockConfigService.obtenerCamposPorEleccion.mockResolvedValue([]);
    const savedCandidato = {
      idCandidato: 1,
      idLista: 1,
      idCategoria: 1,
      nombre: 'Juan',
      apellido: 'Pérez',
      orden: 1,
      fotoUrl: null,
      datosAdicionales: validDatos,
    };
    mockCandidatoRepository.create.mockReturnValue(savedCandidato);
    mockCandidatoRepository.save.mockResolvedValue(savedCandidato);
    mockCandidatoRepository.findOne.mockResolvedValue({
      ...savedCandidato,
      categoria: { nombre: 'Presidente' },
    });

    const result = await service.create(1, {
      nombre: 'Juan',
      apellido: 'Pérez',
      idCategoria: 1,
      datosAdicionales: validDatos,
    });

    expect(result.nombre).toBe('Juan');
    expect(result.datosAdicionales.legajo_utn).toBe('14988');
    expect(result.categoriaNombre).toBe('Presidente');
    expect(mockValidatorService.validateDatosAdicionales).toHaveBeenCalledWith(
      [],
      validDatos,
    );
  });

  it('debe propagar error de validación de datos adicionales', async () => {
    mockListaService.findListaWithEleccionOrFail.mockResolvedValue(
      mockListaContext,
    );
    mockCategoriaRepository.findOne.mockResolvedValue({
      idCategoria: 1,
      idBoleta: 10,
      cantidadCargos: 3,
      nombre: 'Presidente',
    });
    mockConfigService.obtenerCamposPorEleccion.mockResolvedValue([]);
    mockValidatorService.validateDatosAdicionales.mockImplementation(() => {
      throw new UnprocessableEntityException('Validación fallida');
    });

    await expect(
      service.create(1, {
        nombre: 'Juan',
        apellido: 'Pérez',
        idCategoria: 1,
        datosAdicionales: { legajo_utn: '' },
      }),
    ).rejects.toThrow(UnprocessableEntityException);
  });

  it('UAT-02: debe lanzar 409 al modificar candidato en comicio oficializado', async () => {
    mockCandidatoRepository.findOne.mockResolvedValue({
      idCandidato: 1,
      idLista: 1,
      nombre: 'Juan',
      apellido: 'Pérez',
      lista: {
        boleta: {
          eleccion: { estado: EleccionEstado.CONFIGURADA },
        },
      },
    });

    await expect(service.update(1, { nombre: 'Pedro' })).rejects.toThrow(
      ConflictException,
    );
  });
});
