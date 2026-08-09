import { BadRequestException } from '@nestjs/common';
import { TransaccionBlockchainService } from '@/blockchain/services/transaccion-blockchain.service';

const TX_HASH = '0x' + 'ab'.repeat(32);

const createService = () => {
  const saved: unknown[] = [];
  const transaccionRepository = {
    findOne: jest.fn().mockResolvedValue(null),
    save: jest.fn().mockImplementation((row: unknown) => {
      saved.push(row);
      return row;
    }),
    find: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
  };
  const merkleTreeRepository = {
    findOne: jest.fn(),
  };
  const padronRepository = {
    findOne: jest.fn().mockResolvedValue(null),
  };
  const blockchainService = {
    parseElectionTransactionAuditEntry: jest.fn().mockResolvedValue({
      hashTransaccion: TX_HASH,
      numeroBloque: 100,
      marcaTiempo: '2026-08-09T12:00:00.000Z',
      contratoEtiqueta: 'BallotContract',
      nombreEvento: 'SignedVoteCast',
      descripcionLegible: 'Sufragio firmado registrado en la urna digital',
      explorerUrl: `https://sepolia.etherscan.io/tx/${TX_HASH}`,
      logIndex: 2,
    }),
    getVoteParticipationByTxHash: jest.fn().mockResolvedValue({
      txHash: TX_HASH,
      idEleccion: 7,
      blockNumber: 100,
      timestamp: new Date('2026-08-09T12:00:00.000Z'),
      contractAddress: '0xballot',
    }),
    buildExplorerUrl: jest
      .fn()
      .mockReturnValue(`https://sepolia.etherscan.io/tx/${TX_HASH}`),
  };

  const service = new TransaccionBlockchainService(
    transaccionRepository as never,
    merkleTreeRepository as never,
    padronRepository as never,
    blockchainService as never,
  );

  return {
    service,
    transaccionRepository,
    blockchainService,
    saved,
  };
};

describe('TransaccionBlockchainService — VOTAR-373', () => {
  it('registrarDesdeTxHash persists parsed audit entry', async () => {
    const { service, transaccionRepository, saved } = createService();

    await service.registrarDesdeTxHash(7, TX_HASH);

    expect(transaccionRepository.save).toHaveBeenCalledTimes(1);
    expect(saved[0]).toMatchObject({
      hashTransaccion: TX_HASH,
      idEleccion: 7,
      numeroBloque: 100,
    });
  });

  it('registrarDesdeTxHash is idempotent when hash already exists', async () => {
    const { service, transaccionRepository } = createService();
    transaccionRepository.findOne.mockResolvedValue({
      hashTransaccion: TX_HASH,
    });

    await service.registrarDesdeTxHash(7, TX_HASH);

    expect(transaccionRepository.save).not.toHaveBeenCalled();
  });

  it('registrarVotoPublico rejects tx from another election', async () => {
    const { service, blockchainService } = createService();
    blockchainService.getVoteParticipationByTxHash.mockResolvedValue({
      txHash: TX_HASH,
      idEleccion: 99,
      blockNumber: 100,
      timestamp: new Date(),
      contractAddress: '0xballot',
    });

    await expect(service.registrarVotoPublico(7, TX_HASH)).rejects.toThrow(
      'no corresponde al comicio',
    );
  });

  it('registrarDesdeTxHash rejects invalid hash format', async () => {
    const { service } = createService();

    await expect(service.registrarDesdeTxHash(7, 'not-a-hash')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('listarPorEleccion returns mapped entries sorted from repository', async () => {
    const { service, transaccionRepository } = createService();
    transaccionRepository.find.mockResolvedValue([
      {
        hashTransaccion: TX_HASH,
        numeroBloque: 100,
        marcaTiempo: new Date('2026-08-09T12:00:00.000Z'),
        contratoEtiqueta: 'BallotContract',
        nombreEvento: 'SignedVoteCast',
        descripcionLegible: 'Sufragio firmado registrado en la urna digital',
        logIndex: 0,
      },
    ]);

    const actual = await service.listarPorEleccion(7);

    expect(actual).toHaveLength(1);
    expect(actual[0].hashTransaccion).toBe(TX_HASH);
    expect(actual[0].explorerUrl).toContain('etherscan.io');
  });
});

describe('TransaccionBlockchainService — vote estado guard', () => {
  it('registrarVotoPublico delegates to parser after on-chain validation', async () => {
    const { service, blockchainService, transaccionRepository } =
      createService();

    await service.registrarVotoPublico(7, TX_HASH);

    expect(blockchainService.getVoteParticipationByTxHash).toHaveBeenCalledWith(
      TX_HASH,
    );
    expect(transaccionRepository.save).toHaveBeenCalled();
  });
});
