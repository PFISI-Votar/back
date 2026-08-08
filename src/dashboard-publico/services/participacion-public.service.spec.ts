import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { EleccionEstado } from '@/eleccion/enums/eleccion-estado.enum';
import { EstadoBoleta } from '@/eleccion/lista/enums/estado-boleta.enum';
import { EstadoLista } from '@/eleccion/lista/enums/estado-lista.enum';
import { ParticipacionPublicService } from '@/dashboard-publico/services/participacion-public.service';

const createService = (deps?: {
  eleccion?: unknown;
  configuracion?: unknown;
  totalPadron?: number;
  stats?: { totalVotes: number; blankVotes: number; nullVotes: number };
  snapshots?: Array<{ tomadoEn: Date; totalVotos: number }>;
  votesByCandidate?: Record<number, number>;
  blockchainError?: Error;
}) => {
  const eleccionRepository = {
    findOne: jest.fn().mockResolvedValue(
      deps?.eleccion ?? {
        idEleccion: 7,
        nombre: 'Comicio UTN',
        estado: EleccionEstado.ABIERTA,
        fechaFin: new Date(Date.now() + 2 * 60 * 60 * 1_000), // comicio aún abierto → ancla = ahora
      },
    ),
  };
  const configuracionRepository = {
    findOne: jest.fn().mockResolvedValue(
      deps?.configuracion ?? {
        idEleccion: 7,
        mostrarResultadosTiempoReal: true,
      },
    ),
  };

  const defaultSnapshots = deps?.snapshots ?? [
    { tomadoEn: new Date(Date.now() - 2 * 60 * 60 * 1000), totalVotos: 10 },
    { tomadoEn: new Date(Date.now() - 1 * 60 * 60 * 1000), totalVotos: 25 },
  ];

  const queryBuilder = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue(defaultSnapshots),
  };

  const snapshotRepository = {
    createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
  };

  const padronService = {
    obtenerTotalVotantesPublico: jest.fn().mockResolvedValue({
      totalVotantesHabilitados: deps?.totalPadron ?? 100,
    }),
  };
  const blockchainService = {
    getParticipationStats: jest.fn().mockImplementation(() => {
      if (deps?.blockchainError) {
        return Promise.reject(deps.blockchainError);
      }
      return Promise.resolve(
        deps?.stats ?? { totalVotes: 25, blankVotes: 0, nullVotes: 0 },
      );
    }),
    getVotesByCandidate: jest
      .fn()
      .mockImplementation((_id: number, candidateId: number) => {
        const map = deps?.votesByCandidate ?? { 100: 15, 200: 10 };
        return Promise.resolve(map[candidateId] ?? 0);
      }),
  };
  const ofertaElectoralQueryService = {
    obtenerOfertaPublicada: jest.fn().mockResolvedValue({
      eleccion: { idEleccion: 7, estado: EleccionEstado.ABIERTA },
      configuracion: { idEleccion: 7 },
      boleta: { idBoleta: 1, estado: EstadoBoleta.PUBLICADA },
      categorias: [{ idCategoria: 1, nombre: 'Presidente', orden: 1 }],
      listas: [
        {
          idLista: 10,
          nombre: 'Lista A',
          estado: EstadoLista.OFICIALIZADA,
          candidatos: [{ idCandidato: 100, idCategoria: 1, orden: 1 }],
        },
        {
          idLista: 20,
          nombre: 'Lista B',
          estado: EstadoLista.OFICIALIZADA,
          candidatos: [{ idCandidato: 200, idCategoria: 1, orden: 1 }],
        },
      ],
    }),
  };

  const service = new ParticipacionPublicService(
    eleccionRepository as never,
    configuracionRepository as never,
    snapshotRepository as never,
    padronService as never,
    blockchainService as never,
    ofertaElectoralQueryService as never,
  );

  return {
    service,
    eleccionRepository,
    snapshotRepository,
    padronService,
    blockchainService,
    ofertaElectoralQueryService,
  };
};

describe('ParticipacionPublicService — VOTAR-433', () => {
  it('UAT-01: calcula Participación Electoral 25% con padrón 100 y 25 votos', async () => {
    const { service } = createService({
      totalPadron: 100,
      stats: { totalVotes: 25, blankVotes: 0, nullVotes: 0 },
    });

    const actual = await service.obtenerParticipacionPublica(7);

    expect(actual.formula.porcentajeParticipacion).toBe(25);
    expect(actual.formula.expresion).toBe('(25 + 0 + 0) / 100 × 100 = 25%');
    expect(actual.formula.totalSufragios).toBe(25);
    expect(actual.serieTemporal.length).toBeGreaterThan(0);
    expect(actual.serieTemporal.at(-1)?.acumulado).toBe(25);
  });

  it('UAT-01: incluye curva temporal de afluencia desde snapshot DB', async () => {
    const { service, snapshotRepository } = createService();

    const actual = await service.obtenerParticipacionPublica(7, 12);

    expect(snapshotRepository.createQueryBuilder).toHaveBeenCalledWith('s');
    expect(actual.serieTemporal.length).toBeGreaterThan(0);
    expect(actual.serieTemporal.at(-1)?.acumulado).toBe(25);
  });

  it('UAT-02: desglosa votos por lista/categoría y valida coherencia de totales', async () => {
    const { service } = createService({
      stats: { totalVotes: 25, blankVotes: 0, nullVotes: 0 },
      votesByCandidate: { 100: 15, 200: 10 },
    });

    const actual = await service.obtenerParticipacionPublica(7);

    expect(actual.desglosePorCategoria).toHaveLength(1);
    expect(actual.desglosePorCategoria[0].nombreCategoria).toBe('Presidente');
    expect(actual.desglosePorCategoria[0].listas).toEqual([
      { idLista: 10, nombreLista: 'Lista A', votos: 15 },
      { idLista: 20, nombreLista: 'Lista B', votos: 10 },
    ]);
    expect(actual.verificacionTotales).toEqual({
      coherente: true,
      totalOnChain: 25,
      totalCalculado: 25,
    });
  });

  it('UAT-02: incluye blanco y nulo globales en el desglose', async () => {
    const { service } = createService({
      stats: { totalVotes: 30, blankVotes: 3, nullVotes: 2 },
      votesByCandidate: { 100: 15, 200: 10 },
    });

    const actual = await service.obtenerParticipacionPublica(7);

    expect(actual.formula.votosAfirmativos).toBe(25);
    expect(actual.desglosePorCategoria[0].votosEnBlancoGlobales).toBe(3);
    expect(actual.desglosePorCategoria[0].votosNulosGlobales).toBe(2);
    expect(actual.verificacionTotales.coherente).toBe(true);
  });

  it('lanza 404 si el comicio no existe', async () => {
    const { service, eleccionRepository } = createService();
    eleccionRepository.findOne.mockResolvedValue(null);

    await expect(service.obtenerParticipacionPublica(99)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('propaga 503 cuando la capa blockchain no está disponible', async () => {
    const { service } = createService({
      blockchainError: new ServiceUnavailableException('RPC down'),
    });

    await expect(service.obtenerParticipacionPublica(7)).rejects.toThrow(
      ServiceUnavailableException,
    );
  });

  it('marca snapshotCongelado cuando el comicio está cerrado', async () => {
    const { service } = createService({
      eleccion: {
        idEleccion: 7,
        estado: EleccionEstado.CERRADA,
        fechaFin: new Date(Date.now() - 30 * 60 * 1_000), // cerrado hace 30 min
      },
      configuracion: {
        idEleccion: 7,
        mostrarResultadosTiempoReal: true,
      },
    });

    const actual = await service.obtenerParticipacionPublica(7);

    expect(actual.snapshotCongelado).toBe(true);
    expect(actual.fuenteDatos).toContain('getParticipationStats');
  });
});
