import { UnprocessableEntityException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { BoletaService } from '../boleta.service';
import { OficializacionService } from '../oficializacion.service';
import { Boleta } from '../entities/boleta.entity';
import { Eleccion } from '../entities/eleccion.entity';
import { Lista } from '../entities/lista.entity';
import { EleccionEstado } from '../enums/eleccion-estado.enum';
import { EstadoBoleta } from '../enums/estado-boleta.enum';
import { EstadoLista } from '../enums/estado-lista.enum';

describe('OficializacionService', () => {
  let service: OficializacionService;

  const mockEleccionRepository = { findOne: jest.fn() };
  const mockListaRepository = { find: jest.fn() };
  const mockBoletaRepository = { findOne: jest.fn() };
  const mockBoletaService = {
    findBoletaByEleccion: jest.fn(),
  };

  const mockTransactionManager = {
    save: jest.fn(),
  };

  const mockDataSource = {
    transaction: jest.fn((callback) => callback(mockTransactionManager)),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OficializacionService,
        { provide: getRepositoryToken(Eleccion), useValue: mockEleccionRepository },
        { provide: getRepositoryToken(Lista), useValue: mockListaRepository },
        { provide: getRepositoryToken(Boleta), useValue: mockBoletaRepository },
        { provide: BoletaService, useValue: mockBoletaService },
        { provide: DataSource, useValue: mockDataSource },
      ],
    }).compile();

    service = module.get<OficializacionService>(OficializacionService);
  });

  afterEach(() => jest.clearAllMocks());

  it('debe asignar list_id secuencial al oficializar', async () => {
    const eleccion = {
      idEleccion: 1,
      estado: EleccionEstado.BORRADOR,
    };
    const boleta = { idBoleta: 10, idEleccion: 1, estado: EstadoBoleta.BORRADOR };
    const listas = [
      {
        idLista: 1,
        idBoleta: 10,
        nombre: 'Lista A',
        sigla: 'LA',
        estado: EstadoLista.BORRADOR,
        candidatos: [{ idCandidato: 1 }],
      },
      {
        idLista: 2,
        idBoleta: 10,
        nombre: 'Lista B',
        sigla: 'LB',
        estado: EstadoLista.BORRADOR,
        candidatos: [{ idCandidato: 2 }],
      },
    ];

    mockEleccionRepository.findOne.mockResolvedValue(eleccion);
    mockBoletaService.findBoletaByEleccion.mockResolvedValue(boleta);
    mockListaRepository.find.mockResolvedValue(listas);
    mockTransactionManager.save.mockImplementation((_entity, data) => Promise.resolve(data));

    const result = await service.oficializar(1);

    expect(result.estado).toBe(EleccionEstado.CONFIGURADA);
    expect(result.mapeo).toHaveLength(2);
    expect(result.mapeo[0].listId).toBe(1);
    expect(result.mapeo[1].listId).toBe(2);
  });

  it('debe lanzar 422 si no hay listas con candidatos', async () => {
    mockEleccionRepository.findOne.mockResolvedValue({
      idEleccion: 1,
      estado: EleccionEstado.BORRADOR,
    });
    mockBoletaService.findBoletaByEleccion.mockResolvedValue({ idBoleta: 10 });
    mockListaRepository.find.mockResolvedValue([
      { idLista: 1, candidatos: [] },
    ]);

    await expect(service.oficializar(1)).rejects.toThrow(
      UnprocessableEntityException,
    );
  });

  it('debe retornar mapeo solo post-oficialización', async () => {
    mockEleccionRepository.findOne.mockResolvedValue({
      idEleccion: 1,
      estado: EleccionEstado.CONFIGURADA,
    });
    mockBoletaRepository.findOne.mockResolvedValue({ idBoleta: 10, idEleccion: 1 });
    mockListaRepository.find.mockResolvedValue([
      {
        idLista: 1,
        listId: 1,
        nombre: 'Lista A',
        sigla: 'LA',
        estado: EstadoLista.OFICIALIZADA,
      },
    ]);

    const mapeo = await service.obtenerMapeo(1);

    expect(mapeo).toEqual([
      { idLista: 1, listId: 1, nombre: 'Lista A', sigla: 'LA' },
    ]);
  });

  it('debe lanzar 422 al consultar mapeo antes de oficializar', async () => {
    mockEleccionRepository.findOne.mockResolvedValue({
      idEleccion: 1,
      estado: EleccionEstado.BORRADOR,
    });

    await expect(service.obtenerMapeo(1)).rejects.toThrow(
      UnprocessableEntityException,
    );
  });
});
