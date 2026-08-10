import { NotFoundException } from '@nestjs/common';
import { EleccionEstado } from '@/eleccion/enums/eleccion-estado.enum';
import { TransaccionesPublicService } from '@/dashboard-publico/services/transacciones-public.service';

const createService = (deps?: {
  eleccion?: unknown;
  configuracion?: unknown;
  transacciones?: Array<{
    hashTransaccion: string;
    numeroBloque: number;
    marcaTiempo: string;
    contratoEtiqueta: string;
    nombreEvento: string;
    descripcionLegible: string;
    explorerUrl: string;
  }>;
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
    resolveElectionContracts: jest.fn().mockResolvedValue({
      ballot: '0xballot',
      voteRegistry: '0xregistry',
      auditView: '0xaudit',
    }),
    getNetworkDisplayName: jest.fn().mockReturnValue('Sepolia'),
    getChainId: jest.fn().mockReturnValue(11155111),
  };
  const transaccionBlockchainService = {
    listarPorEleccion: jest.fn().mockResolvedValue(
      deps?.transacciones ?? [
        {
          hashTransaccion: '0x' + 'aa'.repeat(32),
          numeroBloque: 100,
          marcaTiempo: '2026-08-08T12:00:00.000Z',
          contratoEtiqueta: 'VoteRegistry',
          nombreEvento: 'VoteCast',
          descripcionLegible: 'Sufragio contabilizado',
          explorerUrl: `https://sepolia.etherscan.io/tx/${'0x' + 'aa'.repeat(32)}`,
          logIndex: 0,
        },
      ],
    ),
  };

  const service = new TransaccionesPublicService(
    eleccionRepository as never,
    configuracionRepository as never,
    blockchainService as never,
    transaccionBlockchainService as never,
  );

  return {
    service,
    eleccionRepository,
    blockchainService,
    transaccionBlockchainService,
  };
};

describe('TransaccionesPublicService — VOTAR-373', () => {
  it('returns indexed transaction history from PostgreSQL', async () => {
    const { service, transaccionBlockchainService } = createService();

    const actual = await service.obtenerTransaccionesPublica(7);

    expect(actual.idEleccion).toBe(7);
    expect(actual.red).toBe('Sepolia');
    expect(actual.fuenteDatos).toContain('append-only');
    expect(actual.transacciones).toHaveLength(1);
    expect(actual.transacciones[0].explorerUrl).toContain(
      'sepolia.etherscan.io/tx/',
    );
    expect(transaccionBlockchainService.listarPorEleccion).toHaveBeenCalledWith(
      7,
    );
  });

  it('marks snapshot as frozen when comicio is closed', async () => {
    const { service } = createService({
      eleccion: {
        idEleccion: 7,
        estado: EleccionEstado.CERRADA,
      },
    });

    const actual = await service.obtenerTransaccionesPublica(7);

    expect(actual.snapshotCongelado).toBe(true);
  });

  it('throws NotFound when comicio does not exist', async () => {
    const { service, eleccionRepository } = createService();
    eleccionRepository.findOne.mockResolvedValue(null);

    await expect(service.obtenerTransaccionesPublica(7)).rejects.toThrow(
      NotFoundException,
    );
  });
});
