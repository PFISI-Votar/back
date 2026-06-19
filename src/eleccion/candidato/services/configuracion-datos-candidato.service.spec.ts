import {
  ConflictException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfiguracionDatosCandidatoService } from '@/eleccion/candidato/services/configuracion-datos-candidato.service';
import { ConfiguracionDatosCandidato } from '@/eleccion/candidato/entities/configuracion-datos-candidato.entity';
import { CampoDatosCandidato } from '@/eleccion/candidato/entities/campo-datos-candidato.entity';
import { Eleccion } from '@/eleccion/entities/eleccion.entity';
import { Candidato } from '@/eleccion/candidato/entities/candidato.entity';
import { EleccionEstado } from '@/eleccion/enums/eleccion-estado.enum';
import type { CampoCandidatoDefinicion } from '@/eleccion/candidato/interfaces/campo-candidato-definicion.interface';
import { mapDefinicionToEntity } from '@/eleccion/candidato/mappers/campo-datos-candidato.mapper';

const camposEjemplo: CampoCandidatoDefinicion[] = [
  {
    clave: 'legajo_utn',
    etiqueta: 'Legajo UTN',
    tipo: 'texto',
    obligatorio: true,
    orden: 1,
    validacion: { pattern: '^\\d{4,6}$' },
  },
];

const buildConfig = (campos: CampoCandidatoDefinicion[] = []) => ({
  idConfiguracion: 1,
  idEleccion: 1,
  campos: campos.map(mapDefinicionToEntity),
});

describe('ConfiguracionDatosCandidatoService', () => {
  let service: ConfiguracionDatosCandidatoService;

  const mockConfigRepository = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
  };

  const mockCampoRepository = {
    delete: jest.fn(),
    save: jest.fn(),
  };

  const mockEleccionRepository = {
    findOne: jest.fn(),
  };

  const mockCandidatoRepository = {
    createQueryBuilder: jest.fn(),
  };

  const mockQueryBuilder = {
    innerJoin: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    getCount: jest.fn(),
  };

  beforeEach(async () => {
    mockCandidatoRepository.createQueryBuilder.mockReturnValue(
      mockQueryBuilder,
    );
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConfiguracionDatosCandidatoService,
        {
          provide: getRepositoryToken(ConfiguracionDatosCandidato),
          useValue: mockConfigRepository,
        },
        {
          provide: getRepositoryToken(CampoDatosCandidato),
          useValue: mockCampoRepository,
        },
        {
          provide: getRepositoryToken(Eleccion),
          useValue: mockEleccionRepository,
        },
        {
          provide: getRepositoryToken(Candidato),
          useValue: mockCandidatoRepository,
        },
      ],
    }).compile();
    service = module.get(ConfiguracionDatosCandidatoService);
  });

  afterEach(() => jest.clearAllMocks());

  it('debe crear configuración vacía por defecto', async () => {
    const config = { idConfiguracion: 1, idEleccion: 1 };
    mockConfigRepository.create.mockReturnValue(config);
    mockConfigRepository.save.mockResolvedValue(config);
    const result = await service.crearConfiguracionPorDefecto(1);
    expect(result.idEleccion).toBe(1);
  });

  it('debe retornar editable=false si hay candidatos', async () => {
    mockEleccionRepository.findOne.mockResolvedValue({
      idEleccion: 1,
      estado: EleccionEstado.BORRADOR,
    });
    mockConfigRepository.findOne.mockResolvedValue(buildConfig(camposEjemplo));
    mockQueryBuilder.getCount.mockResolvedValue(2);
    const result = await service.obtenerPorEleccion(1);
    expect(result.editable).toBe(false);
    expect(result.cantidadCandidatos).toBe(2);
    expect(result.campos[0].clave).toBe('legajo_utn');
  });

  it('debe bloquear guardado si hay candidatos registrados', async () => {
    mockEleccionRepository.findOne.mockResolvedValue({
      idEleccion: 1,
      estado: EleccionEstado.BORRADOR,
    });
    mockQueryBuilder.getCount.mockResolvedValue(1);
    await expect(service.guardar(1, { campos: camposEjemplo })).rejects.toThrow(
      ConflictException,
    );
  });

  it('debe permitir guardar configuración vacía', async () => {
    mockEleccionRepository.findOne.mockResolvedValue({
      idEleccion: 1,
      estado: EleccionEstado.BORRADOR,
    });
    mockQueryBuilder.getCount.mockResolvedValue(0);
    const config = buildConfig();
    mockConfigRepository.findOne.mockResolvedValue(config);
    mockCampoRepository.delete.mockResolvedValue(undefined);
    mockCampoRepository.save.mockResolvedValue([]);
    const result = await service.guardar(1, { campos: [] });
    expect(result.campos).toHaveLength(0);
  });

  it('debe rechazar claves reservadas', async () => {
    mockEleccionRepository.findOne.mockResolvedValue({
      idEleccion: 1,
      estado: EleccionEstado.BORRADOR,
    });
    mockQueryBuilder.getCount.mockResolvedValue(0);
    await expect(
      service.guardar(1, {
        campos: [
          {
            clave: 'nombre',
            etiqueta: 'Nombre',
            tipo: 'texto',
            obligatorio: true,
            orden: 1,
          },
        ],
      }),
    ).rejects.toThrow(UnprocessableEntityException);
  });
});
