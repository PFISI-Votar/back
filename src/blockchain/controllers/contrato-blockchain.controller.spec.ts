import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ContratoBlockchainController } from '@/blockchain/controllers/contrato-blockchain.controller';
import { RedBlockchain } from '@/blockchain/enums/contrato-blockchain.enum';
import { ContratoBlockchainService } from '@/blockchain/services/contrato-blockchain.service';

describe('ContratoBlockchainController — VOTAR-337', () => {
  let controller: ContratoBlockchainController;

  const mockService = {
    getElectionFactory: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ContratoBlockchainController],
      providers: [
        { provide: ContratoBlockchainService, useValue: mockService },
      ],
    }).compile();

    controller = module.get(ContratoBlockchainController);
  });

  it('GET election-factory returns the registered factory payload', async () => {
    const payload = {
      direccionContrato: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
      abi: [{ type: 'function', name: 'createElection' }],
      abiHash: '0x' + 'a'.repeat(64),
      red: RedBlockchain.SEPOLIA,
      chainId: 11155111,
      verificadoEtherscan: true,
      merkleRootStoreAddress: null,
      adminAddress: null,
      txHashDespliegue: null,
      fechaDespliegue: null,
    };
    mockService.getElectionFactory.mockResolvedValue(payload);

    await expect(
      controller.getElectionFactory(RedBlockchain.SEPOLIA),
    ).resolves.toEqual(payload);
    expect(mockService.getElectionFactory).toHaveBeenCalledWith(
      RedBlockchain.SEPOLIA,
    );
  });

  it('propagates NotFoundException when factory is missing', async () => {
    mockService.getElectionFactory.mockRejectedValue(
      new NotFoundException('missing'),
    );

    await expect(controller.getElectionFactory()).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
