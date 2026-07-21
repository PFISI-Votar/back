import { UnprocessableEntityException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { BlockchainService } from '@/blockchain/blockchain.service';
import { CategoriasService } from '@/categoria/categoria.service';
import { ConfiguracionComicio } from '@/eleccion/configuracion-comicio/entities/configuracion-comicio.entity';
import { PoliticaRevoto } from '@/eleccion/configuracion-comicio/enums/politica-revoto.enum';
import { BoletaService } from '@/eleccion/lista/services/boleta.service';
import { OficializacionService } from '@/eleccion/lista/services/oficializacion.service';
import { Boleta } from '@/eleccion/lista/entities/boleta.entity';
import { Eleccion } from '@/eleccion/entities/eleccion.entity';
import { Lista } from '@/eleccion/lista/entities/lista.entity';
import { EleccionEstado } from '@/eleccion/enums/eleccion-estado.enum';
import { EstadoBoleta } from '@/eleccion/lista/enums/estado-boleta.enum';
import { EstadoLista } from '@/eleccion/lista/enums/estado-lista.enum';
import { MinimoCandidatosViolationException } from '@/eleccion/rules-engine/exceptions/minimo-candidatos-violation.exception';
import { RulesEngineService } from '@/eleccion/rules-engine/rules-engine.service';
import { PadronService } from '@/padron/padron.service';

describe('OficializacionService', () => {
  let service: OficializacionService;

  const mockEleccionRepository = { findOne: jest.fn() };
  const mockListaRepository = { find: jest.fn() };
  const mockBoletaRepository = { findOne: jest.fn() };
  const mockConfiguracionRepository = { findOne: jest.fn() };
  const mockBlockchainService = {
    deployElectionStack: jest.fn(),
  };
  const mockBoletaService = {
    findBoletaByEleccion: jest.fn(),
  };
  const mockCategoriasService = {
    validarCategoriasParaOficializar: jest.fn(),
  };
  const mockPadronService = {
    validarPadronParaOficializar: jest.fn(),
  };

  const mockTransactionManager = {
    save: jest.fn(),
  };

  const mockDataSource = {
    transaction: jest.fn(
      (callback: (manager: typeof mockTransactionManager) => unknown) =>
        callback(mockTransactionManager),
    ),
  };

  const mockBoletaConCategorias = {
    idBoleta: 10,
    categorias: [
      {
        idCategoria: 1,
        nombre: 'Presidente',
        minimoPostulantes: 0,
      },
    ],
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OficializacionService,
        RulesEngineService,
        {
          provide: getRepositoryToken(Eleccion),
          useValue: mockEleccionRepository,
        },
        { provide: getRepositoryToken(Lista), useValue: mockListaRepository },
        { provide: getRepositoryToken(Boleta), useValue: mockBoletaRepository },
        {
          provide: getRepositoryToken(ConfiguracionComicio),
          useValue: mockConfiguracionRepository,
        },
        { provide: BoletaService, useValue: mockBoletaService },
        { provide: DataSource, useValue: mockDataSource },
        { provide: CategoriasService, useValue: mockCategoriasService },
        { provide: PadronService, useValue: mockPadronService },
        { provide: BlockchainService, useValue: mockBlockchainService },
      ],
    }).compile();

    service = module.get<OficializacionService>(OficializacionService);
  });

  afterEach(() => jest.clearAllMocks());

  const mockConfigRevoto = () => {
    mockConfiguracionRepository.findOne.mockResolvedValue({
      idEleccion: 1,
      permitirVotoMultiple: false,
      maxVotosPorVotante: 1,
      minIntervaloSegundos: 0,
      politicaRevoto: PoliticaRevoto.DISABLED,
    });
    mockBlockchainService.deployElectionStack.mockResolvedValue({
      ballot: '0x' + '1'.repeat(40),
      voteRegistry: '0x' + '2'.repeat(40),
      auditView: '0x' + '3'.repeat(40),
      txHash: '0xabc',
      blockNumber: 1,
      alreadyDeployed: false,
    });
  };

  const mockPadronValido = () => {
    mockPadronService.validarPadronParaOficializar.mockResolvedValue(undefined);
  };

  it('debe lanzar 422 si no hay padrón electoral cargado', async () => {
    mockEleccionRepository.findOne.mockResolvedValue({
      idEleccion: 1,
      estado: EleccionEstado.BORRADOR,
    });
    mockPadronService.validarPadronParaOficializar.mockRejectedValue(
      new UnprocessableEntityException(
        'El comicio no puede pasar a configurado sin un padrón electoral cargado.',
      ),
    );

    await expect(service.oficializar(1)).rejects.toThrow(
      UnprocessableEntityException,
    );
    expect(
      mockCategoriasService.validarCategoriasParaOficializar,
    ).not.toHaveBeenCalled();
  });

  it('debe lanzar 422 si hay categorías sin listas con candidatos', async () => {
    mockEleccionRepository.findOne.mockResolvedValue({
      idEleccion: 1,
      estado: EleccionEstado.BORRADOR,
    });
    mockPadronValido();
    mockCategoriasService.validarCategoriasParaOficializar.mockRejectedValue(
      new UnprocessableEntityException(
        'El comicio no puede oficializarse: existe al menos una categoría sin listas oficializadas.',
      ),
    );

    await expect(service.oficializar(1)).rejects.toThrow(
      UnprocessableEntityException,
    );
    expect(mockBoletaService.findBoletaByEleccion).not.toHaveBeenCalled();
  });

  it('debe asignar list_id secuencial al oficializar', async () => {
    const eleccion = {
      idEleccion: 1,
      estado: EleccionEstado.BORRADOR,
    };
    const boleta = {
      idBoleta: 10,
      idEleccion: 1,
      estado: EstadoBoleta.BORRADOR,
    };
    const listas = [
      {
        idLista: 1,
        idBoleta: 10,
        nombre: 'Lista A',
        sigla: 'LA',
        estado: EstadoLista.BORRADOR,
        candidatos: [{ idCandidato: 1, idCategoria: 1 }],
      },
      {
        idLista: 2,
        idBoleta: 10,
        nombre: 'Lista B',
        sigla: 'LB',
        estado: EstadoLista.BORRADOR,
        candidatos: [{ idCandidato: 2, idCategoria: 1 }],
      },
    ];

    mockEleccionRepository.findOne.mockResolvedValue(eleccion);
    mockPadronValido();
    mockCategoriasService.validarCategoriasParaOficializar.mockResolvedValue(
      undefined,
    );
    mockBoletaService.findBoletaByEleccion.mockResolvedValue(boleta);
    mockBoletaRepository.findOne.mockResolvedValue(mockBoletaConCategorias);
    mockListaRepository.find.mockResolvedValue(listas);
    mockTransactionManager.save.mockImplementation((_entity, data) =>
      Promise.resolve(data),
    );
    mockConfigRevoto();

    const result = await service.oficializar(1);

    expect(result.estado).toBe(EleccionEstado.CONFIGURADA);
    expect(result.mapeo).toHaveLength(2);
    expect(result.mapeo[0].listId).toBe(1);
    expect(result.mapeo[1].listId).toBe(2);
    expect(mockBlockchainService.deployElectionStack).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ enabled: false, maxVotesPerVoter: 1 }),
    );
  });

  it('omite despliegue on-chain si falta configuracion_comicio', async () => {
    const eleccion = {
      idEleccion: 1,
      estado: EleccionEstado.BORRADOR,
    };
    const boleta = {
      idBoleta: 10,
      idEleccion: 1,
      estado: EstadoBoleta.BORRADOR,
    };
    const listas = [
      {
        idLista: 1,
        idBoleta: 10,
        nombre: 'Lista A',
        sigla: 'LA',
        estado: EstadoLista.BORRADOR,
        candidatos: [{ idCandidato: 1, idCategoria: 1 }],
      },
    ];

    mockEleccionRepository.findOne.mockResolvedValue(eleccion);
    mockPadronValido();
    mockCategoriasService.validarCategoriasParaOficializar.mockResolvedValue(
      undefined,
    );
    mockBoletaService.findBoletaByEleccion.mockResolvedValue(boleta);
    mockBoletaRepository.findOne.mockResolvedValue(mockBoletaConCategorias);
    mockListaRepository.find.mockResolvedValue(listas);
    mockTransactionManager.save.mockImplementation((_entity, data) =>
      Promise.resolve(data),
    );
    mockConfiguracionRepository.findOne.mockResolvedValue(null);

    const result = await service.oficializar(1);

    expect(result.estado).toBe(EleccionEstado.CONFIGURADA);
    expect(mockBlockchainService.deployElectionStack).not.toHaveBeenCalled();
  });

  it('debe lanzar MinimoCandidatosViolationException si hay listas deficientes', async () => {
    mockEleccionRepository.findOne.mockResolvedValue({
      idEleccion: 1,
      estado: EleccionEstado.BORRADOR,
    });
    mockPadronValido();
    mockCategoriasService.validarCategoriasParaOficializar.mockResolvedValue(
      undefined,
    );
    mockBoletaService.findBoletaByEleccion.mockResolvedValue({ idBoleta: 10 });
    mockBoletaRepository.findOne.mockResolvedValue({
      idBoleta: 10,
      categorias: [
        {
          idCategoria: 1,
          nombre: 'Presidente',
          minimoPostulantes: 5,
        },
      ],
    });
    mockListaRepository.find.mockResolvedValue([
      {
        idLista: 1,
        nombre: 'Lista A',
        sigla: 'LA',
        candidatos: [{ idCategoria: 1 }, { idCategoria: 1 }],
      },
    ]);

    await expect(service.oficializar(1)).rejects.toThrow(
      MinimoCandidatosViolationException,
    );
    expect(mockDataSource.transaction).not.toHaveBeenCalled();
  });

  it('debe lanzar 422 si no hay listas con candidatos', async () => {
    mockEleccionRepository.findOne.mockResolvedValue({
      idEleccion: 1,
      estado: EleccionEstado.BORRADOR,
    });
    mockPadronValido();
    mockCategoriasService.validarCategoriasParaOficializar.mockResolvedValue(
      undefined,
    );
    mockBoletaService.findBoletaByEleccion.mockResolvedValue({ idBoleta: 10 });
    mockBoletaRepository.findOne.mockResolvedValue(mockBoletaConCategorias);
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
    mockBoletaRepository.findOne.mockResolvedValue({
      idBoleta: 10,
      idEleccion: 1,
    });
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
