import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { EleccionEstado } from '@/eleccion/enums/eleccion-estado.enum';
import { ContratoEstadoPublicService } from '@/dashboard-publico/services/contrato-estado-public.service';

const onChainMock = {
  estadoOnChain: { codigo: 2, etiqueta: 'ABIERTA' },
  merkleRoot: {
    hash: '0x' + 'ab'.repeat(32),
    publicado: true,
    publicadoEn: '2026-08-08T12:00:00.000Z',
  },
  revoto: {
    habilitado: true,
    maxVotosPorVotante: 3,
    minIntervaloSegundos: 60,
    politicaRevoto: 'LAST_VOTE_WINS' as const,
  },
  contratos: {
    ballot: {
      direccion: '0x1111111111111111111111111111111111111111',
      explorerUrl:
        'https://sepolia.etherscan.io/address/0x1111111111111111111111111111111111111111',
    },
    voteRegistry: {
      direccion: '0x2222222222222222222222222222222222222222',
      explorerUrl:
        'https://sepolia.etherscan.io/address/0x2222222222222222222222222222222222222222',
    },
    auditView: {
      direccion: '0x3333333333333333333333333333333333333333',
      explorerUrl:
        'https://sepolia.etherscan.io/address/0x3333333333333333333333333333333333333333',
    },
    merkleRootStore: {
      direccion: '0x4444444444444444444444444444444444444444',
      explorerUrl:
        'https://sepolia.etherscan.io/address/0x4444444444444444444444444444444444444444',
    },
  },
  red: 'Sepolia',
  chainId: 11155111,
};

const createService = (deps?: {
  eleccion?: unknown;
  configuracion?: unknown;
  onChain?: typeof onChainMock;
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
    getContratoEstadoOnChain: jest.fn().mockImplementation(() => {
      if (deps?.blockchainError) {
        return Promise.reject(deps.blockchainError);
      }
      return Promise.resolve(deps?.onChain ?? onChainMock);
    }),
  };

  return {
    service: new ContratoEstadoPublicService(
      eleccionRepository as never,
      configuracionRepository as never,
      blockchainService as never,
    ),
    eleccionRepository,
    configuracionRepository,
    blockchainService,
  };
};

describe('ContratoEstadoPublicService — VOTAR-367', () => {
  it('returns contract audit metadata from on-chain reads (UAT-01)', async () => {
    const { service } = createService();
    const actual = await service.obtenerContratoEstadoPublica(7);

    expect(actual.estadoOnChain.etiqueta).toBe('ABIERTA');
    expect(actual.merkleRoot.hash).toBe(onChainMock.merkleRoot.hash);
    expect(actual.contratos.auditView.explorerUrl).toContain('etherscan.io');
    expect(actual.revoto.maxVotosPorVotante).toBe(3);
    expect(actual.fuenteDatos).toContain('getElectionState');
  });

  it('marks snapshot as frozen when election is closed', async () => {
    const { service } = createService({
      eleccion: {
        idEleccion: 7,
        estado: EleccionEstado.CERRADA,
      },
    });
    const actual = await service.obtenerContratoEstadoPublica(7);
    expect(actual.snapshotCongelado).toBe(true);
  });

  it('throws NotFoundException when election is missing', async () => {
    const { service, eleccionRepository } = createService();
    eleccionRepository.findOne.mockResolvedValue(null);

    await expect(
      service.obtenerContratoEstadoPublica(99),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('propagates blockchain errors', async () => {
    const { service } = createService({
      blockchainError: new ServiceUnavailableException('RPC down'),
    });

    await expect(
      service.obtenerContratoEstadoPublica(7),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
