import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Repository } from 'typeorm';
import { BlockchainService } from '@/blockchain/blockchain.service';
import { Candidato } from '@/eleccion/candidato/entities/candidato.entity';
import { ConfiguracionComicio } from '@/eleccion/configuracion-comicio/entities/configuracion-comicio.entity';
import { Eleccion } from '@/eleccion/entities/eleccion.entity';
import { EleccionEstado } from '@/eleccion/enums/eleccion-estado.enum';
import { Boleta } from '@/eleccion/lista/entities/boleta.entity';
import { Lista } from '@/eleccion/lista/entities/lista.entity';
import { EstadoLista } from '@/eleccion/lista/enums/estado-lista.enum';
import { PadronElectoral } from '@/padron/entities/padron-electoral.entity';
import { EscrutinioCacheService } from '@/escrutinio/services/escrutinio-cache.service';
import { EscrutinioService } from '@/escrutinio/services/escrutinio.service';

describe('EscrutinioService — VOTAR-364', () => {
  let service: EscrutinioService;
  let eleccionRepository: jest.Mocked<Repository<Eleccion>>;
  let configuracionRepository: jest.Mocked<Repository<ConfiguracionComicio>>;
  let boletaRepository: jest.Mocked<Repository<Boleta>>;
  let listaRepository: jest.Mocked<Repository<Lista>>;
  let candidatoRepository: jest.Mocked<Repository<Candidato>>;
  let padronRepository: jest.Mocked<Repository<PadronElectoral>>;
  let blockchainService: jest.Mocked<
    Pick<BlockchainService, 'fetchEscrutinioTallies'>
  >;
  let cacheService: EscrutinioCacheService;

  const mockEleccion = {
    idEleccion: 7,
    nombre: 'Comicio Test',
    estado: EleccionEstado.ABIERTA,
  } as Eleccion;

  const mockConfig = {
    idEleccion: 7,
    mostrarResultadosTiempoReal: true,
  } as ConfiguracionComicio;

  const mockCandidato = {
    idCandidato: 10,
    nombre: 'Ana',
    apellido: 'Pérez',
    idLista: 1,
    idCategoria: 2,
    lista: {
      idLista: 1,
      nombre: 'Lista A',
      sigla: 'LA',
      color: '#2f6f9f',
      estado: EstadoLista.OFICIALIZADA,
    },
    categoria: { idCategoria: 2, nombre: 'Presidente' },
  } as unknown as Candidato;

  beforeEach(async () => {
    cacheService = new EscrutinioCacheService();
    blockchainService = {
      fetchEscrutinioTallies: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EscrutinioService,
        { provide: EscrutinioCacheService, useValue: cacheService },
        { provide: BlockchainService, useValue: blockchainService },
        {
          provide: getRepositoryToken(Eleccion),
          useValue: { findOne: jest.fn(), createQueryBuilder: jest.fn() },
        },
        {
          provide: getRepositoryToken(ConfiguracionComicio),
          useValue: { findOne: jest.fn() },
        },
        {
          provide: getRepositoryToken(Boleta),
          useValue: { findOne: jest.fn() },
        },
        {
          provide: getRepositoryToken(Lista),
          useValue: { find: jest.fn() },
        },
        {
          provide: getRepositoryToken(Candidato),
          useValue: { find: jest.fn() },
        },
        {
          provide: getRepositoryToken(PadronElectoral),
          useValue: { findOne: jest.fn() },
        },
      ],
    }).compile();

    service = module.get(EscrutinioService);
    eleccionRepository = module.get(getRepositoryToken(Eleccion));
    configuracionRepository = module.get(
      getRepositoryToken(ConfiguracionComicio),
    );
    boletaRepository = module.get(getRepositoryToken(Boleta));
    listaRepository = module.get(getRepositoryToken(Lista));
    candidatoRepository = module.get(getRepositoryToken(Candidato));
    padronRepository = module.get(getRepositoryToken(PadronElectoral));
  });

  const arrangeHappyPath = (): void => {
    eleccionRepository.findOne.mockResolvedValue(mockEleccion);
    configuracionRepository.findOne.mockResolvedValue(mockConfig);
    boletaRepository.findOne.mockResolvedValue({
      idBoleta: 1,
      idEleccion: 7,
    } as Boleta);
    listaRepository.find.mockResolvedValue([
      { idLista: 1, estado: EstadoLista.OFICIALIZADA } as Lista,
    ]);
    candidatoRepository.find.mockResolvedValue([mockCandidato]);
    padronRepository.findOne.mockResolvedValue({
      totalVotantesHabilitados: 100,
    } as PadronElectoral);
    blockchainService.fetchEscrutinioTallies.mockResolvedValue({
      participation: { totalVotes: 10, blankVotes: 1, nullVotes: 0 },
      votesByCandidateId: { 10: 9 },
    });
  };

  it('maps on-chain tallies with off-chain candidate metadata (happy path)', async () => {
    arrangeHappyPath();

    const actual = await service.obtenerResultados(7);

    expect(actual.idEleccion).toBe(7);
    expect(actual.fuente).toBe('ON_CHAIN');
    expect(actual.congelado).toBe(false);
    expect(actual.participacion).toEqual({
      totalVotos: 10,
      votosBlanco: 1,
      votosNulo: 0,
      totalVotantesHabilitados: 100,
      porcentajeParticipacion: 10,
    });
    expect(actual.candidatos).toHaveLength(1);
    expect(actual.candidatos[0]).toMatchObject({
      idCandidato: 10,
      nombre: 'Ana',
      apellido: 'Pérez',
      nombreLista: 'Lista A',
      votos: 9,
      porcentaje: 90,
    });
  });

  it('counts blank and null separately from partisan tallies', async () => {
    arrangeHappyPath();
    blockchainService.fetchEscrutinioTallies.mockResolvedValue({
      participation: { totalVotes: 5, blankVotes: 2, nullVotes: 1 },
      votesByCandidateId: { 10: 2 },
    });

    const actual = await service.obtenerResultados(7);

    expect(actual.participacion.votosBlanco).toBe(2);
    expect(actual.participacion.votosNulo).toBe(1);
    expect(actual.candidatos[0].votos).toBe(2);
  });

  it('rejects BORRADOR comicios with 422', async () => {
    eleccionRepository.findOne.mockResolvedValue({
      ...mockEleccion,
      estado: EleccionEstado.BORRADOR,
    });

    await expect(service.obtenerResultados(7)).rejects.toThrow(
      UnprocessableEntityException,
    );
  });

  it('propagates 503 when AuditView is unavailable', async () => {
    arrangeHappyPath();
    blockchainService.fetchEscrutinioTallies.mockRejectedValue(
      new ServiceUnavailableException('No hay contrato AuditView'),
    );

    await expect(service.obtenerResultados(7)).rejects.toThrow(
      ServiceUnavailableException,
    );
  });

  it('throws NotFoundException when election is missing', async () => {
    eleccionRepository.findOne.mockResolvedValue(null);

    await expect(service.obtenerResultados(99)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('marks congelado when mostrarResultadosTiempoReal is false', async () => {
    arrangeHappyPath();
    configuracionRepository.findOne.mockResolvedValue({
      ...mockConfig,
      mostrarResultadosTiempoReal: false,
    });

    const actual = await service.obtenerResultados(7);

    expect(actual.congelado).toBe(true);
  });

  it('refreshAndDetectChange reports changed only when fingerprint differs', async () => {
    arrangeHappyPath();

    const first = await service.refreshAndDetectChange(7);
    expect(first.changed).toBe(true);

    const second = await service.refreshAndDetectChange(7);
    expect(second.changed).toBe(false);

    blockchainService.fetchEscrutinioTallies.mockResolvedValue({
      participation: { totalVotes: 11, blankVotes: 1, nullVotes: 0 },
      votesByCandidateId: { 10: 10 },
    });
    const third = await service.refreshAndDetectChange(7);
    expect(third.changed).toBe(true);
    expect(third.snapshot.participacion.totalVotos).toBe(11);
  });

  it('serves cached snapshot on subsequent obtenerResultados without forceRefresh', async () => {
    arrangeHappyPath();
    await service.obtenerResultados(7);
    expect(blockchainService.fetchEscrutinioTallies).toHaveBeenCalledTimes(1);

    await service.obtenerResultados(7);
    expect(blockchainService.fetchEscrutinioTallies).toHaveBeenCalledTimes(1);
  });
});
