import { EthersRelayBroadcaster } from '@/relayer/ethers-relay-broadcaster';
import { RelayCastFailedError } from '@/relayer/relay-errors';

const mockStaticCall = jest.fn();
const mockEstimateGas = jest.fn();
const mockCastSignedVote = jest.fn();
const mockReset = jest.fn();
const mockGetSecret = jest.fn();

jest.mock('ethers', () => {
  const actual = jest.requireActual<typeof import('ethers')>('ethers');
  return {
    ...actual,
    Contract: jest.fn().mockImplementation(() => ({
      castSignedVote: Object.assign(mockCastSignedVote, {
        staticCall: mockStaticCall,
        estimateGas: mockEstimateGas,
      }),
    })),
    NonceManager: jest.fn().mockImplementation(() => ({ reset: mockReset })),
    Wallet: jest.fn().mockImplementation(() => ({})),
  };
});

const input = {
  contractAddress: '0x4444444444444444444444444444444444444444',
  electionId: 15,
  voterLeaf: '0x' + '11'.repeat(32),
  nullifier: '0x' + '22'.repeat(32),
  selectionHash: '0x' + '33'.repeat(32),
  candidateIds: [1n],
  timestamp: 1_700_000_000n,
  expectedSigner: '0x1111111111111111111111111111111111111111',
  merkleProof: [],
  signature: '0x44',
  validatorSignature: '0x55',
};

describe('EthersRelayBroadcaster', () => {
  let broadcaster: EthersRelayBroadcaster;

  beforeEach(() => {
    jest.clearAllMocks();
    mockStaticCall.mockResolvedValue(undefined);
    mockEstimateGas.mockResolvedValue(100n);
    mockCastSignedVote.mockResolvedValue({ hash: '0xabc' });
    mockGetSecret.mockReturnValue('0x' + '1'.repeat(64));

    broadcaster = new EthersRelayBroadcaster(
      { get: jest.fn().mockReturnValue(false) } as never,
      { getSecret: mockGetSecret } as never,
      {
        hasUrls: jest.fn().mockReturnValue(true),
        create: jest.fn().mockReturnValue({}),
      } as never,
    );
  });

  it('resincroniza el nonce y reintenta una vez tras un rechazo por nonce stale', async () => {
    mockCastSignedVote
      .mockRejectedValueOnce(new Error('nonce has already been used'))
      .mockResolvedValueOnce({ hash: '0xresynced' });

    await expect(broadcaster.castSignedVote(input)).resolves.toBe('0xresynced');

    expect(mockReset).toHaveBeenCalledTimes(1);
    expect(mockCastSignedVote).toHaveBeenCalledTimes(2);
    expect(mockStaticCall).toHaveBeenCalledTimes(1);
    expect(mockEstimateGas).toHaveBeenCalledTimes(1);
  });

  it('no reintenta ni resetea el nonce ante un error de otro tipo', async () => {
    mockCastSignedVote.mockRejectedValueOnce(new Error('execution reverted'));

    await expect(broadcaster.castSignedVote(input)).rejects.toBeInstanceOf(
      RelayCastFailedError,
    );

    expect(mockReset).not.toHaveBeenCalled();
    expect(mockCastSignedVote).toHaveBeenCalledTimes(1);
  });

  it('limita la resincronización a un solo reintento', async () => {
    mockCastSignedVote.mockRejectedValue(
      Object.assign(new Error('nonce too low'), { code: 'NONCE_EXPIRED' }),
    );

    await expect(broadcaster.castSignedVote(input)).rejects.toBeInstanceOf(
      RelayCastFailedError,
    );

    expect(mockReset).toHaveBeenCalledTimes(1);
    expect(mockCastSignedVote).toHaveBeenCalledTimes(2);
  });
});
