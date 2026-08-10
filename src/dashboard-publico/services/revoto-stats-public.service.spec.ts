import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { EleccionEstado } from '@/eleccion/enums/eleccion-estado.enum';
import { RevotoStatsPublicService } from '@/dashboard-publico/services/revoto-stats-public.service';

const createService = (deps?: {
  eleccion?: unknown;
  configuracion?: unknown;
  stats?: {
    totalRevotes: number;
    uniqueVoters: number;
    overwriteRatio: number;
  };
  timeline?: Array<{
    etiqueta: string;
    overwriteRatio: number;
    totalRevotes: number;
    totalEventos: number;
  }>;
  blockchainError?: Error;
}) => {
  const eleccionRepository = {
    findOne: jest.fn().mockResolvedValue(
      deps?.eleccion ?? {
        idEleccion: 7,
        nombre: 'Comicio UTN',
        estado: EleccionEstado.ABIERTA,
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
  const blockchainService = {
    getRevoteStats: jest.fn().mockImplementation(() => {
      if (deps?.blockchainError) {
        return Promise.reject(deps.blockchainError);
      }
      return Promise.resolve(
        deps?.stats ?? {
          totalRevotes: 30,
          uniqueVoters: 70,
          overwriteRatio: 0.3,
        },
      );
    }),
  };
  const transaccionBlockchainService = {
    buildRevoteOverwriteTimeline: jest.fn().mockResolvedValue(
      deps?.timeline ?? [
        {
          etiqueta: '10:00',
          overwriteRatio: 0.2,
          totalRevotes: 10,
          totalEventos: 50,
        },
        {
          etiqueta: '11:00',
          overwriteRatio: 0.3,
          totalRevotes: 30,
          totalEventos: 100,
        },
      ],
    ),
  };

  return {
    service: new RevotoStatsPublicService(
      eleccionRepository as never,
      configuracionRepository as never,
      blockchainService as never,
      transaccionBlockchainService as never,
    ),
    eleccionRepository,
    configuracionRepository,
    blockchainService,
    transaccionBlockchainService,
  };
};

describe('RevotoStatsPublicService — VOTAR-329', () => {
  it('returns revote stats from AuditViewContract.getRevoteStats (UAT-01)', async () => {
    const { service } = createService();
    const actual = await service.obtenerRevotoStatsPublica(7);

    expect(actual.totalRevotes).toBe(30);
    expect(actual.uniqueVoters).toBe(70);
    expect(actual.overwriteRatio).toBe(0.3);
    expect(actual.fuenteDatos).toBe(
      'AuditViewContract.getRevoteStats + transaccion_blockchain (VOTAR-373)',
    );
    expect(actual.serieTemporal).toHaveLength(2);
  });

  it('marks snapshot as frozen when election is closed', async () => {
    const { service } = createService({
      eleccion: {
        idEleccion: 7,
        estado: EleccionEstado.CERRADA,
      },
    });
    const actual = await service.obtenerRevotoStatsPublica(7);
    expect(actual.snapshotCongelado).toBe(true);
  });

  it('throws NotFoundException when election is missing', async () => {
    const { service, eleccionRepository } = createService();
    eleccionRepository.findOne.mockResolvedValue(null);

    await expect(service.obtenerRevotoStatsPublica(99)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('propagates blockchain errors', async () => {
    const { service } = createService({
      blockchainError: new ServiceUnavailableException('RPC down'),
    });

    await expect(service.obtenerRevotoStatsPublica(7)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
