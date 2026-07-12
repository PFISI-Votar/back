/* eslint-disable @typescript-eslint/unbound-method */
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  NotFoundException,
  UnprocessableEntityException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Repository } from 'typeorm';
import { ElectionStateService } from './election-state.service';
import { Eleccion } from '@/eleccion/entities/eleccion.entity';
import { EleccionEstado } from '@/eleccion/enums/eleccion-estado.enum';
import { BlockchainService } from '@/blockchain/blockchain.service';

describe('ElectionStateService', () => {
  let service: ElectionStateService;
  let eleccionRepository: jest.Mocked<Repository<Eleccion>>;
  let blockchainService: jest.Mocked<BlockchainService>;

  const mockEleccion: Eleccion = {
    idEleccion: 1,
    titulo: 'Test Election',
    descripcion: 'Test Description',
    estado: EleccionEstado.CONFIGURADA,
    fechaInicio: new Date('2026-07-15T10:00:00Z'),
    fechaFin: new Date('2026-07-15T18:00:00Z'),
    createdAt: new Date(),
    updatedAt: new Date(),
  } as Eleccion;

  beforeEach(async () => {
    const mockRepository = {
      findOne: jest.fn(),
      save: jest.fn(),
    };

    const mockBlockchainService = {
      syncElectionState: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ElectionStateService,
        {
          provide: getRepositoryToken(Eleccion),
          useValue: mockRepository,
        },
        {
          provide: BlockchainService,
          useValue: mockBlockchainService,
        },
      ],
    }).compile();

    service = module.get<ElectionStateService>(ElectionStateService);
    eleccionRepository = module.get(getRepositoryToken(Eleccion));
    blockchainService = module.get(BlockchainService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('transitionToAbierta', () => {
    it('should sync on-chain first then persist ABIERTA', async () => {
      const eleccion = { ...mockEleccion, estado: EleccionEstado.CONFIGURADA };
      eleccionRepository.findOne.mockResolvedValue(eleccion);
      eleccionRepository.save.mockResolvedValue({
        ...eleccion,
        estado: EleccionEstado.ABIERTA,
      });
      blockchainService.syncElectionState.mockResolvedValue({
        txHash: '0xabc123',
        blockNumber: 12345,
      });

      const result = await service.transitionToAbierta(1);

      expect(eleccionRepository.findOne).toHaveBeenCalledWith({
        where: { idEleccion: 1 },
      });
      expect(blockchainService.syncElectionState).toHaveBeenCalledWith(
        1,
        EleccionEstado.ABIERTA,
      );
      expect(eleccionRepository.save).toHaveBeenCalledWith({
        ...eleccion,
        estado: EleccionEstado.ABIERTA,
      });
      const syncOrder =
        blockchainService.syncElectionState.mock.invocationCallOrder[0];
      const saveOrder = eleccionRepository.save.mock.invocationCallOrder[0];
      expect(syncOrder).toBeLessThan(saveOrder);
      expect(result.estado).toBe(EleccionEstado.ABIERTA);
    });

    it('should throw NotFoundException when election does not exist', async () => {
      eleccionRepository.findOne.mockResolvedValue(null);

      await expect(service.transitionToAbierta(999)).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.transitionToAbierta(999)).rejects.toThrow(
        'Elección 999 no encontrada',
      );
    });

    it('should throw UnprocessableEntityException when election is not in CONFIGURADA state', async () => {
      const eleccion = { ...mockEleccion, estado: EleccionEstado.BORRADOR };
      eleccionRepository.findOne.mockResolvedValue(eleccion);

      await expect(service.transitionToAbierta(1)).rejects.toThrow(
        UnprocessableEntityException,
      );
      await expect(service.transitionToAbierta(1)).rejects.toThrow(
        /debe estar en estado CONFIGURADA/,
      );
    });

    it('should not persist DB state when blockchain sync fails', async () => {
      const eleccion = { ...mockEleccion, estado: EleccionEstado.CONFIGURADA };
      eleccionRepository.findOne.mockResolvedValue(eleccion);
      blockchainService.syncElectionState.mockRejectedValue(
        new ServiceUnavailableException('Blockchain error'),
      );

      await expect(service.transitionToAbierta(1)).rejects.toThrow(
        ServiceUnavailableException,
      );

      expect(blockchainService.syncElectionState).toHaveBeenCalledWith(
        1,
        EleccionEstado.ABIERTA,
      );
      expect(eleccionRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('transitionToCerrada', () => {
    it('should sync on-chain first then persist CERRADA', async () => {
      const eleccion = { ...mockEleccion, estado: EleccionEstado.ABIERTA };
      eleccionRepository.findOne.mockResolvedValue(eleccion);
      eleccionRepository.save.mockResolvedValue({
        ...eleccion,
        estado: EleccionEstado.CERRADA,
      });
      blockchainService.syncElectionState.mockResolvedValue({
        txHash: '0xdef456',
        blockNumber: 12346,
      });

      const result = await service.transitionToCerrada(1);

      expect(blockchainService.syncElectionState).toHaveBeenCalledWith(
        1,
        EleccionEstado.CERRADA,
      );
      const syncOrder =
        blockchainService.syncElectionState.mock.invocationCallOrder[0];
      const saveOrder = eleccionRepository.save.mock.invocationCallOrder[0];
      expect(syncOrder).toBeLessThan(saveOrder);
      expect(result.estado).toBe(EleccionEstado.CERRADA);
    });

    it('should throw when election is not in ABIERTA state', async () => {
      const eleccion = { ...mockEleccion, estado: EleccionEstado.CONFIGURADA };
      eleccionRepository.findOne.mockResolvedValue(eleccion);

      await expect(service.transitionToCerrada(1)).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    it('should not persist DB state when blockchain sync fails', async () => {
      const eleccion = { ...mockEleccion, estado: EleccionEstado.ABIERTA };
      eleccionRepository.findOne.mockResolvedValue(eleccion);
      blockchainService.syncElectionState.mockRejectedValue(
        new ServiceUnavailableException('Blockchain error'),
      );

      await expect(service.transitionToCerrada(1)).rejects.toThrow(
        ServiceUnavailableException,
      );

      expect(eleccionRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('transitionToEscrutada', () => {
    it('should sync on-chain first then persist ESCRUTADA', async () => {
      const eleccion = { ...mockEleccion, estado: EleccionEstado.CERRADA };
      eleccionRepository.findOne.mockResolvedValue(eleccion);
      eleccionRepository.save.mockResolvedValue({
        ...eleccion,
        estado: EleccionEstado.ESCRUTADA,
      });
      blockchainService.syncElectionState.mockResolvedValue({
        txHash: '0xghi789',
        blockNumber: 12347,
      });

      const result = await service.transitionToEscrutada(1);

      expect(blockchainService.syncElectionState).toHaveBeenCalledWith(
        1,
        EleccionEstado.ESCRUTADA,
      );
      const syncOrder =
        blockchainService.syncElectionState.mock.invocationCallOrder[0];
      const saveOrder = eleccionRepository.save.mock.invocationCallOrder[0];
      expect(syncOrder).toBeLessThan(saveOrder);
      expect(result.estado).toBe(EleccionEstado.ESCRUTADA);
    });

    it('should throw when election is not in CERRADA state', async () => {
      const eleccion = { ...mockEleccion, estado: EleccionEstado.ABIERTA };
      eleccionRepository.findOne.mockResolvedValue(eleccion);

      await expect(service.transitionToEscrutada(1)).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    it('should not persist DB state when blockchain sync fails', async () => {
      const eleccion = { ...mockEleccion, estado: EleccionEstado.CERRADA };
      eleccionRepository.findOne.mockResolvedValue(eleccion);
      blockchainService.syncElectionState.mockRejectedValue(
        new ServiceUnavailableException('Blockchain error'),
      );

      await expect(service.transitionToEscrutada(1)).rejects.toThrow(
        ServiceUnavailableException,
      );

      expect(eleccionRepository.save).not.toHaveBeenCalled();
    });
  });
});
