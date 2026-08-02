import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import {
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { BlockchainService } from './blockchain.service';
import { ContratoBlockchainService } from './services/contrato-blockchain.service';
import { EleccionEstado } from '@/eleccion/enums/eleccion-estado.enum';

const mockPublishRoot = jest.fn();
const mockSetElectionState = jest.fn();
const mockWait = jest.fn();
const mockGetBlock = jest.fn();
const mockGetTransactionReceipt = jest.fn();
const mockParseLog = jest.fn();
const mockGetParticipationStats = jest.fn();
const mockGetVotesByCandidate = jest.fn();
const mockGetElection = jest.fn();
const mockQueryFilter = jest.fn();
const mockVoteCastFilter = jest.fn();
const mockRegisterCandidates = jest.fn();
const mockSetElectionWindow = jest.fn();
const mockLockConfigMerkle = jest.fn();
const mockLockConfigFactory = jest.fn();

jest.mock('ethers', () => {
  const actual = jest.requireActual<typeof import('ethers')>('ethers');
  return {
    ...actual,
    Contract: jest.fn().mockImplementation((_address: string, abi: unknown) => {
      const abiList = Array.isArray(abi) ? abi : [];
      const hasRegisterCandidates = abiList.some(
        (item: { name?: string }) => item.name === 'registerCandidates',
      );
      const hasVoteCast = abiList.some(
        (item: { name?: string }) => item.name === 'VoteCast',
      );
      const hasGetParticipation = abiList.some(
        (item: { name?: string }) => item.name === 'getParticipationStats',
      );
      const hasGetElection = abiList.some(
        (item: { name?: string }) => item.name === 'getElection',
      );
      // VOTE_REGISTRY_CONTRACT_ABI carries both the VoteCast/VoteUpdated events
      // and the registerCandidates function fragment in one array (VOTAR-345),
      // so a real Contract built from it supports both — merge, don't branch.
      if (hasRegisterCandidates || hasVoteCast) {
        return {
          registerCandidates: mockRegisterCandidates,
          filters: { VoteCast: mockVoteCastFilter },
          queryFilter: mockQueryFilter,
        };
      }
      if (hasGetParticipation) {
        return {
          getParticipationStats: mockGetParticipationStats,
          getVotesByCandidate: mockGetVotesByCandidate,
        };
      }
      if (hasGetElection) {
        // ELECTION_FACTORY_CONTRACT_ABI (VOTAR-327): also exposes lockConfig,
        // used by BlockchainService.lockRevoteConfig.
        return {
          getElection: mockGetElection,
          lockConfig: mockLockConfigFactory,
        };
      }
      return {
        publishRoot: mockPublishRoot,
        setElectionState: mockSetElectionState,
        setElectionWindow: mockSetElectionWindow,
        // MERKLE_ROOT_STORE_ABI (VOTAR-327): lockConfig, used by
        // BlockchainService.lockElectionWindow.
        lockConfig: mockLockConfigMerkle,
      };
    }),
    Wallet: jest.fn().mockImplementation(() => ({})),
    JsonRpcProvider: jest.fn().mockImplementation(() => ({
      getBlock: mockGetBlock,
      getTransactionReceipt: mockGetTransactionReceipt,
    })),
    Interface: jest.fn().mockImplementation((abi: unknown) => ({
      parseLog: mockParseLog,
      // Delegate to the real ethers Interface so decodeVoteRegistryErrorName's
      // custom-error decoding is exercised faithfully in tests, not stubbed.
      parseError: (data: string) =>
        new actual.Interface(abi as never).parseError(data),
    })),
  };
});

describe('BlockchainService', () => {
  let service: BlockchainService;

  const mockConfig = {
    get: jest.fn(),
  };

  const mockContratoBlockchain = {
    getElectionFactory: jest.fn(),
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
        AUDIT_VIEW_CONTRACT_ADDRESS:
          '0x1111111111111111111111111111111111111111',
        VOTE_REGISTRY_CONTRACT_ADDRESS:
          '0x2222222222222222222222222222222222222222',
        ETHERSCAN_BASE_URL: 'https://sepolia.etherscan.io',
      };
      return values[key];
    });
    mockPublishRoot.mockResolvedValue({ wait: mockWait });
    mockSetElectionState.mockResolvedValue({ wait: mockWait });
    mockRegisterCandidates.mockResolvedValue({ wait: mockWait });
    mockSetElectionWindow.mockResolvedValue({ wait: mockWait });
    mockLockConfigMerkle.mockResolvedValue({ wait: mockWait });
    mockLockConfigFactory.mockResolvedValue({ wait: mockWait });
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
    mockGetParticipationStats.mockResolvedValue([25n, 0n, 0n]);
    mockGetVotesByCandidate.mockResolvedValue(10n);
    mockVoteCastFilter.mockReturnValue({});
    mockQueryFilter.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BlockchainService,
        { provide: ConfigService, useValue: mockConfig },
        {
          provide: ContratoBlockchainService,
          useValue: mockContratoBlockchain,
        },
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
        logs: [{ address: ballot, topics: ['0x1'], data: '0x' }],
      });
      mockParseLog.mockReturnValue({
        name: 'SignedVoteCast',
        args: [7n, '0xnull', '0xsel', '0xsigner'],
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

    it('VOTAR-439: resolves the vote when the election Ballot differs from the legacy global BALLOT_CONTRACT_ADDRESS', async () => {
      // No env fallback available — forces resolution via ElectionFactory.getElection.
      mockConfig.get.mockImplementation((key: string) => {
        const values: Record<string, string> = {
          SEPOLIA_RPC_URL: 'https://sepolia.example.com',
        };
        return values[key];
      });
      const perElectionBallot = '0x7777777777777777777777777777777777777777';
      mockGetTransactionReceipt.mockResolvedValue({
        hash: txHash,
        status: 1,
        to: perElectionBallot,
        blockNumber: 4582193,
        logs: [{ address: perElectionBallot, topics: ['0x1'], data: '0x' }],
      });
      mockContratoBlockchain.getElectionFactory.mockResolvedValue({
        direccionContrato: '0x3333333333333333333333333333333333333333',
      });
      mockGetElection.mockResolvedValue({
        ballot: perElectionBallot,
        voteRegistry: '0x5555555555555555555555555555555555555555',
        auditView: '0x6666666666666666666666666666666666666666',
        exists: true,
      });

      const actual = await service.getVoteParticipationByTxHash(txHash);

      expect(actual.idEleccion).toBe(7);
      expect(actual.contractAddress).toBe(perElectionBallot);
      expect(mockGetElection).toHaveBeenCalledWith(7);
    });

    it('VOTAR-439: throws NotFound when the tx targets a different election Ballot than the one resolved for the decoded idEleccion', async () => {
      mockConfig.get.mockImplementation((key: string) => {
        const values: Record<string, string> = {
          SEPOLIA_RPC_URL: 'https://sepolia.example.com',
        };
        return values[key];
      });
      mockContratoBlockchain.getElectionFactory.mockResolvedValue({
        direccionContrato: '0x3333333333333333333333333333333333333333',
      });
      mockGetElection.mockResolvedValue({
        ballot: '0x8888888888888888888888888888888888888888',
        voteRegistry: '0x5555555555555555555555555555555555555555',
        auditView: '0x6666666666666666666666666666666666666666',
        exists: true,
      });

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

  describe('registerCandidates — VOTAR-345', () => {
    it('seals the candidate set and returns tx metadata on success', async () => {
      const actual = await service.registerCandidates(42, [101, 202]);

      expect(actual).toEqual({
        txHash: '0xabc',
        blockNumber: 100,
        alreadySealed: false,
      });
      expect(mockRegisterCandidates).toHaveBeenCalledWith(42, [101, 202]);
    });

    it('throws when blockchain env is missing', async () => {
      mockConfig.get.mockImplementation(() => undefined);

      await expect(service.registerCandidates(42, [101])).rejects.toThrow(
        ServiceUnavailableException,
      );
    });

    it('treats CandidateSetSealed as idempotent, not an error', async () => {
      mockRegisterCandidates.mockRejectedValue(
        new Error('execution reverted: CandidateSetSealed(42)'),
      );

      const actual = await service.registerCandidates(42, [101]);

      expect(actual).toEqual({
        txHash: '',
        blockNumber: 0,
        alreadySealed: true,
      });
    });

    it('maps ReservedCandidateId to a 422 with a helpful message', async () => {
      mockRegisterCandidates.mockRejectedValue(
        new Error('execution reverted: ReservedCandidateId(101)'),
      );

      await expect(service.registerCandidates(42, [101])).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    it('maps AccessControl revert to a helpful role message', async () => {
      mockRegisterCandidates.mockRejectedValue(
        new Error('AccessControlUnauthorizedAccount'),
      );

      await expect(service.registerCandidates(42, [101])).rejects.toThrow(
        /ELECTION_ADMIN_ROLE/,
      );
    });

    it('treats CandidateSetSealed as idempotent when only raw revert .data is present (real send() shape)', async () => {
      // ethers never populates .message with the decoded error name for a
      // real send() estimateGas failure — only .data carries the selector.
      const rawError = Object.assign(
        new Error('execution reverted (unknown custom error)'),
        {
          data: '0xa71d1be20000000000000000000000000000000000000000000000000000000000000010',
        },
      );
      mockRegisterCandidates.mockRejectedValue(rawError);

      const actual = await service.registerCandidates(42, [101]);

      expect(actual).toEqual({
        txHash: '',
        blockNumber: 0,
        alreadySealed: true,
      });
    });

    it('maps ReservedCandidateId from raw revert .data (real send() shape)', async () => {
      const rawError = Object.assign(
        new Error('execution reverted (unknown custom error)'),
        {
          data: '0x1452bb320000000000000000000000000000000000000000000000000000000000000065',
        },
      );
      mockRegisterCandidates.mockRejectedValue(rawError);

      await expect(service.registerCandidates(42, [101])).rejects.toThrow(
        UnprocessableEntityException,
      );
    });
  });

  describe('syncElectionWindow — VOTAR-321', () => {
    const startTime = new Date('2026-07-15T10:00:00Z');
    const endTime = new Date('2026-07-15T18:00:00Z');

    it('syncs the voting window on success', async () => {
      const actual = await service.syncElectionWindow(42, startTime, endTime);

      expect(actual.txHash).toBe('0xabc');
      expect(actual.blockNumber).toBe(100);
      expect(mockSetElectionWindow).toHaveBeenCalledWith(
        42,
        Math.floor(startTime.getTime() / 1000),
        Math.floor(endTime.getTime() / 1000),
      );
    });

    it('treats a ConfigLocked revert as a no-op (idempotent retry, VOTAR-327)', async () => {
      mockSetElectionWindow.mockRejectedValue(
        new Error('execution reverted: ConfigLocked(42)'),
      );

      const actual = await service.syncElectionWindow(42, startTime, endTime);

      expect(actual).toEqual({ txHash: '', blockNumber: 0 });
    });
  });

  describe('lockElectionWindow — VOTAR-327', () => {
    it('locks the voting window and returns tx metadata on success', async () => {
      const actual = await service.lockElectionWindow(42);

      expect(actual).toEqual({
        txHash: '0xabc',
        blockNumber: 100,
        alreadyLocked: false,
      });
      expect(mockLockConfigMerkle).toHaveBeenCalledWith(42);
    });

    it('throws when blockchain env is missing', async () => {
      mockConfig.get.mockImplementation(() => undefined);

      await expect(service.lockElectionWindow(42)).rejects.toThrow(
        ServiceUnavailableException,
      );
    });

    it('treats ConfigLocked as idempotent, not an error', async () => {
      mockLockConfigMerkle.mockRejectedValue(
        new Error('execution reverted: ConfigLocked(42)'),
      );

      const actual = await service.lockElectionWindow(42);

      expect(actual).toEqual({
        txHash: '',
        blockNumber: 0,
        alreadyLocked: true,
      });
    });

    it('treats ConfigLocked as idempotent when only raw revert .data is present (real send() shape)', async () => {
      const rawError = Object.assign(
        new Error('execution reverted (unknown custom error)'),
        {
          // ConfigLocked(uint256) encoded with electionId=42.
          data: '0x9b4a661a000000000000000000000000000000000000000000000000000000000000002a',
        },
      );
      mockLockConfigMerkle.mockRejectedValue(rawError);

      const actual = await service.lockElectionWindow(42);

      expect(actual).toEqual({
        txHash: '',
        blockNumber: 0,
        alreadyLocked: true,
      });
    });

    it('maps AccessControl revert to a helpful role message', async () => {
      mockLockConfigMerkle.mockRejectedValue(
        new Error('AccessControlUnauthorizedAccount'),
      );

      await expect(service.lockElectionWindow(42)).rejects.toThrow(
        /ELECTION_ADMIN_ROLE/,
      );
    });
  });

  describe('lockRevoteConfig — VOTAR-327', () => {
    beforeEach(() => {
      mockContratoBlockchain.getElectionFactory.mockResolvedValue({
        direccionContrato: '0x3333333333333333333333333333333333333333',
      });
    });

    it('locks the RevoteConfig audit trail and returns tx metadata on success', async () => {
      const actual = await service.lockRevoteConfig(42);

      expect(actual).toEqual({
        txHash: '0xabc',
        blockNumber: 100,
        alreadyLocked: false,
      });
      expect(mockLockConfigFactory).toHaveBeenCalledWith(42);
    });

    it('throws when blockchain env is missing', async () => {
      mockConfig.get.mockImplementation(() => undefined);

      await expect(service.lockRevoteConfig(42)).rejects.toThrow(
        ServiceUnavailableException,
      );
    });

    it('treats ConfigLocked as idempotent, not an error', async () => {
      mockLockConfigFactory.mockRejectedValue(
        new Error('execution reverted: ConfigLocked(42)'),
      );

      const actual = await service.lockRevoteConfig(42);

      expect(actual).toEqual({
        txHash: '',
        blockNumber: 0,
        alreadyLocked: true,
      });
    });

    it('maps ElectionDoesNotExist to a 422 with a helpful message', async () => {
      mockLockConfigFactory.mockRejectedValue(
        new Error('execution reverted: ElectionDoesNotExist(42)'),
      );

      await expect(service.lockRevoteConfig(42)).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    it('maps AccessControl revert to a helpful role message', async () => {
      mockLockConfigFactory.mockRejectedValue(
        new Error('AccessControlUnauthorizedAccount'),
      );

      await expect(service.lockRevoteConfig(42)).rejects.toThrow(
        /DEFAULT_ADMIN_ROLE/,
      );
    });
  });

  describe('participation queries — VOTAR-365', () => {
    it('getParticipationStats returns aggregate tallies without nullifiers', async () => {
      const actual = await service.getParticipationStats(7);

      expect(actual).toEqual({
        totalVotes: 25,
        blankVotes: 0,
        nullVotes: 0,
      });
      expect(actual).not.toHaveProperty('voterHash');
      expect(actual).not.toHaveProperty('nullifier');
      expect(mockGetParticipationStats).toHaveBeenCalledWith(7);
    });

    it('getVotesByCandidate returns on-chain tally', async () => {
      const actual = await service.getVotesByCandidate(7, 101);
      expect(actual).toBe(10);
      expect(mockGetVotesByCandidate).toHaveBeenCalledWith(7, 101);
    });

    it('getVoteCastTimeline builds hourly buckets from first votes only', async () => {
      const nowSec = Math.floor(Date.now() / 1000);
      mockQueryFilter.mockResolvedValue([
        {
          args: {
            voterHash: '0xaaa',
            isOverwrite: false,
          },
          blockNumber: 1,
        },
        {
          args: {
            voterHash: '0xaaa',
            isOverwrite: true,
          },
          blockNumber: 2,
        },
        {
          args: {
            voterHash: '0xbbb',
            isOverwrite: false,
          },
          blockNumber: 3,
        },
      ]);
      mockGetBlock.mockResolvedValue({ timestamp: nowSec - 1800 });

      const actual = await service.getVoteCastTimeline(7, 2);

      expect(actual).toHaveLength(2);
      expect(actual[1].acumulado).toBe(2);
      expect(actual.reduce((sum, point) => sum + point.nuevos, 0)).toBe(2);
      const serialized = JSON.stringify(actual);
      expect(serialized).not.toMatch(/0xaaa|0xbbb/);
    });

    it('resolveElectionContracts falls back to factory when env addresses missing', async () => {
      mockConfig.get.mockImplementation((key: string) => {
        const values: Record<string, string> = {
          SEPOLIA_RPC_URL: 'https://sepolia.example.com',
          MERKLE_ROOT_STORE_ADDRESS:
            '0x55d1d115309872C16B9646362C82fFa246F3F652',
          MERKLE_UPDATER_PRIVATE_KEY: '0x' + '1'.repeat(64),
          ELECTION_ADMIN_PRIVATE_KEY: '0x' + '2'.repeat(64),
          BALLOT_CONTRACT_ADDRESS: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
          ETHERSCAN_BASE_URL: 'https://sepolia.etherscan.io',
        };
        return values[key];
      });
      mockContratoBlockchain.getElectionFactory.mockResolvedValue({
        direccionContrato: '0x3333333333333333333333333333333333333333',
      });
      mockGetElection.mockResolvedValue({
        ballot: '0x4444444444444444444444444444444444444444',
        voteRegistry: '0x5555555555555555555555555555555555555555',
        auditView: '0x6666666666666666666666666666666666666666',
        exists: true,
      });

      const actual = await service.resolveElectionContracts(9);

      expect(actual.auditView).toBe(
        '0x6666666666666666666666666666666666666666',
      );
      expect(mockGetElection).toHaveBeenCalledWith(9);
    });

    it('resolveElectionContracts throws 422 when factory has no deployment', async () => {
      mockConfig.get.mockImplementation((key: string) => {
        if (key === 'SEPOLIA_RPC_URL') return 'https://sepolia.example.com';
        return undefined;
      });
      mockContratoBlockchain.getElectionFactory.mockResolvedValue({
        direccionContrato: '0x3333333333333333333333333333333333333333',
      });
      mockGetElection.mockResolvedValue({
        ballot: '0x0000000000000000000000000000000000000000',
        voteRegistry: '0x0000000000000000000000000000000000000000',
        auditView: '0x0000000000000000000000000000000000000000',
        exists: false,
      });

      await expect(service.resolveElectionContracts(9)).rejects.toThrow(
        UnprocessableEntityException,
      );
    });
  });
});
