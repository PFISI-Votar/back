import { NotFoundException } from '@nestjs/common';
import { EleccionEstado } from '@/eleccion/enums/eleccion-estado.enum';
import { TipoVotacion } from '@/eleccion/enums/tipo-votacion.enum';
import { EstadoLista } from '@/eleccion/lista/enums/estado-lista.enum';
import { DashboardPublicoService } from './dashboard-publico.service';

describe('DashboardPublicoService', () => {
  const eleccionRepository = {
    findOne: jest.fn(),
  };
  const boletaRepository = {
    findOne: jest.fn(),
  };
  const listaRepository = {
    find: jest.fn(),
  };
  const blockchainService = {
    getParticipationStats: jest.fn(),
    getVotesByCandidate: jest.fn(),
  };
  const padronService = {
    obtenerTotalVotantesPublico: jest.fn(),
  };

  const service = new DashboardPublicoService(
    eleccionRepository as never,
    boletaRepository as never,
    listaRepository as never,
    blockchainService as never,
    padronService as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('lanza 404 si el comicio no existe', async () => {
    eleccionRepository.findOne.mockResolvedValue(null);
    await expect(service.obtenerEscrutinio(99)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('mientras está ABIERTA expone participación sin resultados', async () => {
    eleccionRepository.findOne.mockResolvedValue({
      idEleccion: 1,
      estado: EleccionEstado.ABIERTA,
      tipoVotacion: TipoVotacion.POR_LISTA,
    });
    blockchainService.getParticipationStats.mockResolvedValue({
      totalVotes: 250,
      blankVotes: 10,
      nullVotes: 5,
    });
    padronService.obtenerTotalVotantesPublico.mockResolvedValue({
      totalVotantesHabilitados: 1000,
    });

    const actual = await service.obtenerEscrutinio(1);

    expect(actual.participacion).toEqual({
      votosFiscalizados: 250,
      votosEnBlanco: 10,
      votosNulos: 5,
      totalVotantesHabilitados: 1000,
      porcentajeEscrutinio: 25,
    });
    expect(actual.resultados).toBeNull();
  });

  it('cuando está CERRADA agrega resultados por lista (POR_LISTA)', async () => {
    eleccionRepository.findOne.mockResolvedValue({
      idEleccion: 1,
      estado: EleccionEstado.CERRADA,
      tipoVotacion: TipoVotacion.POR_LISTA,
    });
    blockchainService.getParticipationStats.mockResolvedValue({
      totalVotes: 100,
      blankVotes: 4,
      nullVotes: 1,
    });
    padronService.obtenerTotalVotantesPublico.mockResolvedValue({
      totalVotantesHabilitados: 200,
    });
    boletaRepository.findOne.mockResolvedValue({ idBoleta: 7, idEleccion: 1 });
    listaRepository.find.mockResolvedValue([
      {
        idLista: 1,
        nombre: 'Lista A',
        sigla: 'LA',
        color: '#111111',
        estado: EstadoLista.OFICIALIZADA,
        candidatos: [
          {
            idCandidato: 10,
            idCategoria: 1,
            nombre: 'Ana',
            apellido: 'Pérez',
            categoria: { nombre: 'Presidencia' },
          },
          {
            idCandidato: 11,
            idCategoria: 2,
            nombre: 'Luis',
            apellido: 'Gómez',
            categoria: { nombre: 'Secretaría' },
          },
        ],
      },
    ]);
    blockchainService.getVotesByCandidate.mockImplementation(
      (_id: number, candidateId: number) => {
        if (candidateId === 10) return Promise.resolve(60);
        if (candidateId === 11) return Promise.resolve(20);
        return Promise.resolve(0);
      },
    );

    const actual = await service.obtenerEscrutinio(1);

    expect(actual.participacion.porcentajeEscrutinio).toBe(50);
    expect(actual.resultados?.porLista).toEqual([
      {
        idLista: 1,
        nombre: 'Lista A',
        sigla: 'LA',
        color: '#111111',
        votos: 80,
        porcentaje: 80,
      },
    ]);
    expect(actual.resultados?.porCandidato).toBeUndefined();
    expect(actual.resultados?.votosEnBlanco).toBe(4);
    expect(actual.resultados?.votosNulos).toBe(1);
  });
});
