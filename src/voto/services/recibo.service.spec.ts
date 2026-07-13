import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { verifyMessage, Wallet } from 'ethers';
import { BlockchainService } from '@/blockchain/blockchain.service';
import { Eleccion } from '@/eleccion/entities/eleccion.entity';
import { ReciboService } from '@/voto/services/recibo.service';
import { buildReciboCanonicalPayload } from '@/voto/lib/recibo-canonical';

describe('ReciboService (VOTAR-360)', () => {
  let service: ReciboService;

  const signingWallet = Wallet.createRandom();
  const txHash =
    '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';

  const blockchainService = {
    getVoteParticipationByTxHash: jest.fn(),
    buildExplorerUrl: jest.fn(
      (hash: string) => `https://sepolia.etherscan.io/tx/${hash}`,
    ),
  };

  const eleccionRepository = {
    findOne: jest.fn(),
  };

  const configService = {
    get: jest.fn((key: string) => {
      if (key === 'RECIBO_SIGNING_PRIVATE_KEY') {
        return signingWallet.privateKey;
      }
      return undefined;
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    blockchainService.getVoteParticipationByTxHash.mockResolvedValue({
      txHash,
      idEleccion: 7,
      blockNumber: 4582193,
      timestamp: new Date('2026-07-11T14:30:00.000Z'),
      contractAddress: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
    });
    eleccionRepository.findOne.mockResolvedValue({
      idEleccion: 7,
      nombre: 'Centro de Estudiantes 2026',
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReciboService,
        { provide: BlockchainService, useValue: blockchainService },
        { provide: ConfigService, useValue: configService },
        { provide: getRepositoryToken(Eleccion), useValue: eleccionRepository },
      ],
    }).compile();

    service = module.get(ReciboService);
  });

  it('verificarPorTxHash confirma participación sin revelar el voto (UAT-02)', async () => {
    const result = await service.verificarPorTxHash(txHash);

    expect(result.confirmado).toBe(true);
    expect(result.blockNumber).toBe(4582193);
    expect(result.mensaje).toContain('bloque 4582193');
    expect(result).not.toHaveProperty('selectionHash');
    expect(result).not.toHaveProperty('nullifier');
    expect(result).not.toHaveProperty('voterLeaf');
    expect(JSON.stringify(result)).not.toMatch(/candidato|lista|selection/i);
  });

  it('verificarPorTxHash rechaza hash inválido', async () => {
    await expect(service.verificarPorTxHash('0x1234')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('firmarRecibo firma el payload canónico sin almacenar PDF', async () => {
    const timestamp = '2026-07-11T14:30:00.000Z';
    const result = await service.firmarRecibo({
      idEleccion: 7,
      txHash,
      blockNumber: 4582193,
      timestamp,
    });

    const expectedPayload = buildReciboCanonicalPayload({
      idEleccion: 7,
      txHash,
      blockNumber: 4582193,
      timestamp,
    });

    expect(result.payloadCanonico).toBe(expectedPayload);
    expect(result.algoritmo).toBe('ECDSA_SECP256K1_SHA256');
    expect(result.clavePublica).toBe(signingWallet.address);
    expect(result.firmaDigital).toMatch(/^0x[0-9a-fA-F]+$/);

    const recovered = verifyMessage(expectedPayload, result.firmaDigital);
    expect(recovered.toLowerCase()).toBe(signingWallet.address.toLowerCase());
  });

  it('firmarRecibo rechaza idEleccion inconsistente', async () => {
    await expect(
      service.firmarRecibo({
        idEleccion: 99,
        txHash,
        blockNumber: 4582193,
        timestamp: '2026-07-11T14:30:00.000Z',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('obtenerClavePublica falla si no hay clave configurada', async () => {
    configService.get.mockReturnValue(undefined);
    expect(() => service.obtenerClavePublica()).toThrow(
      ServiceUnavailableException,
    );
  });
});
