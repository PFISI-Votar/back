import { ConflictException, UnprocessableEntityException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CandidatoDatosValidatorService } from '../candidato-datos-validator.service';
import { CandidatoService } from '../candidato.service';
import { ConfiguracionDatosCandidatoService } from '../configuracion-datos-candidato.service';
import { ListaService } from '../lista.service';
import { Candidato } from '../entities/candidato.entity';
import { Categoria } from '../entities/categoria.entity';
import { EleccionEstado } from '../enums/eleccion-estado.enum';

const validDatos = {
  legajo_utn: '14988',
  dni: '40123456',
  cantidad_avales: 2,
};

describe('CandidatoService', () => {
  let service: CandidatoService;

  const mockCandidatoRepository = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    remove: jest.fn(),
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
        { provide: getRepositoryToken(Candidato), useValue: mockCandidatoRepository },
        { provide: getRepositoryToken(Categoria), useValue: mockCategoriaRepository },
        { provide: ListaService, useValue: mockListaService },
        { provide: ConfiguracionDatosCandidatoService, useValue: mockConfigService },
        { provide: CandidatoDatosValidatorService, useValue: mockValidatorService },
      ],
    }).compile();

    service = module.get<CandidatoService>(CandidatoService);
  });

  afterEach(() => jest.clearAllMocks());

  it('UAT-01: debe crear candidato con datos adicionales válidos', async () => {
    mockListaService.findListaWithEleccionOrFail.mockResolvedValue(mockListaContext);
    mockCategoriaRepository.findOne.mockResolvedValue({ idCategoria: 1, idBoleta: 10 });
    mockConfigService.obtenerCamposPorEleccion.mockResolvedValue([]);
    const savedCandidato = {
      idCandidato: 1,
      idLista: 1,
      idCategoria: 1,
      nombre: 'Juan',
      apellido: 'Pérez',
      cargo: null,
      orden: 1,
      fotoUrl: null,
      datosAdicionales: validDatos,
    };
    mockCandidatoRepository.create.mockReturnValue(savedCandidato);
    mockCandidatoRepository.save.mockResolvedValue(savedCandidato);

    const result = await service.create(1, {
      nombre: 'Juan',
      apellido: 'Pérez',
      idCategoria: 1,
      datosAdicionales: validDatos,
    });

    expect(result.nombre).toBe('Juan');
    expect(result.datosAdicionales.legajo_utn).toBe('14988');
    expect(mockValidatorService.validateDatosAdicionales).toHaveBeenCalledWith(
      [],
      validDatos,
    );
  });

  it('debe propagar error de validación de datos adicionales', async () => {
    mockListaService.findListaWithEleccionOrFail.mockResolvedValue(mockListaContext);
    mockCategoriaRepository.findOne.mockResolvedValue({ idCategoria: 1, idBoleta: 10 });
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

    await expect(service.update(1, { nombre: 'Pedro' })).rejects.toThrow(ConflictException);
  });
});
