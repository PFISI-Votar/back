import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ServiceUnavailableException } from '@nestjs/common';
import { BlockchainService } from './blockchain.service';
import { EleccionEstado } from '@/eleccion/enums/eleccion-estado.enum';

const mockPublishRoot = jest.fn();
const mockSetElectionState = jest.fn();
const mockWait = jest.fn();
const mockGetBlock = jest.fn();
const mockGetTransactionReceipt = jest.fn();
const mockParseLog = jest.fn();

jest.mock('ethers', () => {
  const actual = jest.requireActual<typeof import('ethers')>('ethers');
  return {
    ...actual,
    Contract: jest.fn().mockImplementation(() => ({
      publishRoot: mockPublishRoot,
      setElectionState: mockSetElectionState,
    })),
    Wallet: jest.fn().mockImplementation(() => ({})),
    JsonRpcProvider: jest.fn().mockImplementation(() => ({
      getBlock: mockGetBlock,
      getTransactionReceipt: mockGetTransactionReceipt,
    })),
    Interface: jest.fn().mockImplementation(() => ({
      parseLog: mockParseLog,
    })),
  };
});

describe('BlockchainService', () => {
  let service: BlockchainService;

  const mockConfig = {
    get: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockConfig.get.mockImplementation((key: string) => {
      const values: Record<string, string> = {
        SEPOLIA_RPC_URL: 'https://sepolia.example.com',
        MERKLE_ROOT_STORE_ADDRESS: '0x55d1d115309872C16B9646362C82fFa246F3F652',
        MERKLE_UPDATER_PRIVATE_KEY: '0x' + '1'.repeat(64),
        ELECTION_ADMIN_PRIVATE_KEY: '0x' + '2'.repeat(64),
        BALLOT_CONTRACT_ADDRESS: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
        ETHERSCAN_BASE_URL: 'https://sepolia.etherscan.io',
      };
      return values[key];
    });
    mockPublishRoot.mockResolvedValue({ wait: mockWait });
    mockSetElectionState.mockResolvedValue({ wait: mockWait });
    mockWait.mockResolvedValue({
      hash: '0xabc',
      blockNumber: 100,
      logs: [{ topics: [], data: '0x' }],
    });
    mockGetBlock.mockResolvedValue({ timestamp: 1700000000 });
    mockParseLog.mockReturnValue({
      name: 'RootPublished',
      args: [42, '0x' + 'a'.repeat(64), 1700000000n],
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BlockchainService,
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    service = module.get<BlockchainService>(BlockchainService);
  });

  it('publishMerkleRoot returns tx metadata on success (UAT-01)', async () => {
    const merkleRoot = '0x' + 'a'.repeat(64);
    const actual = await service.publishMerkleRoot(42, merkleRoot);

    expect(actual.txHash).toBe('0xabc');
    expect(actual.blockNumber).toBe(100);
    expect(actual.electionId).toBe(42);
    expect(actual.merkleRoot).toBe(merkleRoot);
    expect(mockPublishRoot).toHaveBeenCalledWith(42, merkleRoot);
  });

  it('publishMerkleRoot throws when blockchain env is missing', async () => {
    mockConfig.get.mockImplementation(() => undefined);
    await expect(
      service.publishMerkleRoot(42, '0x' + 'a'.repeat(64)),
    ).rejects.toThrow(ServiceUnavailableException);
  });

  it('publishMerkleRoot maps AccessControl revert (UAT-02)', async () => {
    mockPublishRoot.mockRejectedValue(
      new Error('AccessControlUnauthorizedAccount'),
    );
    await expect(
      service.publishMerkleRoot(42, '0x' + 'a'.repeat(64)),
    ).rejects.toThrow(/MERKLE_UPDATER_ROLE/);
  });

  it('buildExplorerUrl returns Etherscan link', () => {
    expect(service.buildExplorerUrl('0xabc')).toBe(
      'https://sepolia.etherscan.io/tx/0xabc',
    );
  });

  it('getNetworkDisplayName defaults to Sepolia', () => {
    expect(service.getNetworkDisplayName()).toBe('Sepolia');
  });

  describe('getVoteParticipationByTxHash — VOTAR-360/366', () => {
    const ballot = '0x5FbDB2315678afecb367f032d93F642f64180aa3';
    const txHash = '0x' + 'ab'.repeat(32);

    beforeEach(() => {
      mockGetTransactionReceipt.mockResolvedValue({
        hash: txHash,
        status: 1,
        to: ballot,
        blockNumber: 4582193,
        logs: [{ topics: ['0x1'], data: '0x' }],
      });
      mockParseLog.mockReturnValue({
        name: 'SignedVoteCast',
        args: [7n, '0xleaf', '0xnull', '0xsel', '0xsigner'],
      });
      mockGetBlock.mockResolvedValue({ timestamp: 1720708200 });
    });

    it('returns participation metadata without vote content fields', async () => {
      const actual = await service.getVoteParticipationByTxHash(txHash);

      expect(actual).toEqual({
        txHash: txHash.toLowerCase(),
        idEleccion: 7,
        blockNumber: 4582193,
        timestamp: new Date(1720708200 * 1000),
        contractAddress: ballot,
      });
      expect(actual).not.toHaveProperty('selectionHash');
      expect(actual).not.toHaveProperty('nullifier');
    });

    it('throws NotFound when receipt is missing (VOTAR-366 UAT-02)', async () => {
      mockGetTransactionReceipt.mockResolvedValue(null);
      await expect(
        service.getVoteParticipationByTxHash(txHash),
      ).rejects.toThrow(/registro de sufragio no pudo ser encontrado/i);
    });

    it('throws when SignedVoteCast is absent (VOTAR-366 UAT-02)', async () => {
      mockParseLog.mockReturnValue(null);
      await expect(
        service.getVoteParticipationByTxHash(txHash),
      ).rejects.toThrow(/registro de sufragio no pudo ser encontrado/i);
    });
  });

  describe('syncElectionState — VOTAR-336', () => {
    it('syncs election state to blockchain successfully', async () => {
      const actual = await service.syncElectionState(
        42,
        EleccionEstado.ABIERTA,
      );

      expect(actual.txHash).toBe('0xabc');
      expect(actual.blockNumber).toBe(100);
      expect(mockSetElectionState).toHaveBeenCalledWith(42, 2); // ABIERTA = 2 (OPEN)
    });

    it('maps all election states correctly', async () => {
      await service.syncElectionState(42, EleccionEstado.BORRADOR);
      expect(mockSetElectionState).toHaveBeenCalledWith(42, 0); // DRAFT

      await service.syncElectionState(42, EleccionEstado.CONFIGURADA);
      expect(mockSetElectionState).toHaveBeenCalledWith(42, 1); // CONFIGURED

      await service.syncElectionState(42, EleccionEstado.CERRADA);
      expect(mockSetElectionState).toHaveBeenCalledWith(42, 3); // CLOSED

      await service.syncElectionState(42, EleccionEstado.ESCRUTADA);
      expect(mockSetElectionState).toHaveBeenCalledWith(42, 4); // TALLIED
    });

    it('throws when blockchain env is missing', async () => {
      mockConfig.get.mockImplementation(() => undefined);

      await expect(
        service.syncElectionState(42, EleccionEstado.ABIERTA),
      ).rejects.toThrow(ServiceUnavailableException);
      await expect(
        service.syncElectionState(42, EleccionEstado.ABIERTA),
      ).rejects.toThrow(
        /sincronización de estado on-chain no está configurada/,
      );
    });

    it('maps AccessControl revert to helpful error', async () => {
      mockSetElectionState.mockRejectedValue(
        new Error('AccessControlUnauthorizedAccount'),
      );

      await expect(
        service.syncElectionState(42, EleccionEstado.ABIERTA),
      ).rejects.toThrow(/ELECTION_ADMIN_ROLE/);
    });

    it('throws when receipt is null', async () => {
      mockWait.mockResolvedValue(null);

      await expect(
        service.syncElectionState(42, EleccionEstado.ABIERTA),
      ).rejects.toThrow(/no devolvió recibo de confirmación/);
    });

    it('handles generic blockchain errors', async () => {
      mockSetElectionState.mockRejectedValue(new Error('Network timeout'));

      await expect(
        service.syncElectionState(42, EleccionEstado.ABIERTA),
      ).rejects.toThrow(/No se pudo sincronizar el estado on-chain/);
    });
  });
});
