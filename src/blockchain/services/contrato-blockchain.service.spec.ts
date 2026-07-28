import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ContratoBlockchain } from '@/blockchain/entities/contrato-blockchain.entity';
import {
  RedBlockchain,
  TipoContratoBlockchain,
} from '@/blockchain/enums/contrato-blockchain.enum';
import { ContratoBlockchainService } from '@/blockchain/services/contrato-blockchain.service';

describe('ContratoBlockchainService — VOTAR-337', () => {
  let service: ContratoBlockchainService;

  const mockRepository = {
    findOne: jest.fn(),
    create: jest.fn(
      (value: Partial<ContratoBlockchain>): Partial<ContratoBlockchain> =>
        value,
    ),
    save: jest.fn(),
  };

  const factoryRow: ContratoBlockchain = {
    idContrato: 1,
    tipo: TipoContratoBlockchain.ELECTION_FACTORY,
    nombre: 'ElectionFactory',
    direccionContrato: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
    abi: [{ type: 'function', name: 'createElection' }],
    abiHash: '0x' + 'a'.repeat(64),
    red: RedBlockchain.SEPOLIA,
    chainId: 11155111,
    txHashDespliegue: '0x' + 'b'.repeat(64),
    fechaDespliegue: new Date('2026-07-13T12:00:00.000Z'),
    verificadoEtherscan: true,
    merkleRootStoreAddress: '0xbDe278040000000000000000000000000000999f',
    adminAddress: '0x4852CB3d2acA0fDD4677a3e6dD1C2f3AcEFD6928',
    fechaRegistro: new Date('2026-07-13T12:00:00.000Z'),
    fechaActualizacion: new Date('2026-07-13T12:00:00.000Z'),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContratoBlockchainService,
        {
          provide: getRepositoryToken(ContratoBlockchain),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get(ContratoBlockchainService);
  });

  describe('upsertElectionFactory', () => {
    it('inserts a new factory row when none exists (UAT-02)', async () => {
      mockRepository.findOne.mockResolvedValue(null);
      mockRepository.save.mockImplementation(
        (entity: Partial<ContratoBlockchain>): Promise<ContratoBlockchain> =>
          Promise.resolve({
            ...factoryRow,
            ...entity,
            idContrato: 1,
          } as ContratoBlockchain),
      );

      const saved = await service.upsertElectionFactory({
        direccionContrato: factoryRow.direccionContrato,
        abi: factoryRow.abi,
        abiHash: factoryRow.abiHash,
        red: RedBlockchain.SEPOLIA,
        chainId: 11155111,
        txHashDespliegue: factoryRow.txHashDespliegue,
        fechaDespliegue: factoryRow.fechaDespliegue,
        verificadoEtherscan: true,
        merkleRootStoreAddress: factoryRow.merkleRootStoreAddress,
        adminAddress: factoryRow.adminAddress,
      });

      expect(mockRepository.create).toHaveBeenCalled();
      expect(mockRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          tipo: TipoContratoBlockchain.ELECTION_FACTORY,
          direccionContrato: factoryRow.direccionContrato,
          abi: factoryRow.abi,
          abiHash: factoryRow.abiHash,
          red: RedBlockchain.SEPOLIA,
          verificadoEtherscan: true,
        }),
      );
      expect(saved.direccionContrato).toBe(factoryRow.direccionContrato);
    });

    it('updates the existing factory row for the same network', async () => {
      mockRepository.findOne.mockResolvedValue({ ...factoryRow });
      mockRepository.save.mockImplementation(
        (entity: ContratoBlockchain): Promise<ContratoBlockchain> =>
          Promise.resolve(entity),
      );

      const updatedAddress = '0x0000000000000000000000000000000000000337';
      await service.upsertElectionFactory({
        direccionContrato: updatedAddress,
        abi: factoryRow.abi,
        abiHash: factoryRow.abiHash,
        red: RedBlockchain.SEPOLIA,
        chainId: 11155111,
      });

      expect(mockRepository.create).not.toHaveBeenCalled();
      expect(mockRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          idContrato: 1,
          direccionContrato: updatedAddress,
        }),
      );
    });
  });

  describe('getElectionFactory', () => {
    it('returns address + ABI for dynamic calls (UAT-02)', async () => {
      mockRepository.findOne.mockResolvedValue(factoryRow);

      const dto = await service.getElectionFactory(RedBlockchain.SEPOLIA);

      expect(dto.direccionContrato).toBe(factoryRow.direccionContrato);
      expect(dto.abi).toEqual(factoryRow.abi);
      expect(dto.abiHash).toBe(factoryRow.abiHash);
      expect(dto.verificadoEtherscan).toBe(true);
      expect(dto.red).toBe(RedBlockchain.SEPOLIA);
    });

    it('throws NotFoundException when factory is not registered', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      await expect(service.getElectionFactory()).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
