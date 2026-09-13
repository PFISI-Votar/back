/* eslint-disable @typescript-eslint/unbound-method */
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Repository } from 'typeorm';
import { ElectionStateService } from './election-state.service';
import { Eleccion } from '@/eleccion/entities/eleccion.entity';
import { EleccionEstado } from '@/eleccion/enums/eleccion-estado.enum';
import { TipoVotacion } from '@/eleccion/enums/tipo-votacion.enum';
import { OfertaElectoralQueryService } from '@/eleccion/lista/services/oferta-electoral-query.service';
import { BlockchainService } from '@/blockchain/blockchain.service';
import { EleccionGateway } from '@/eleccion/gateways/eleccion.gateway';

describe('ElectionStateService', () => {
  let service: ElectionStateService;
  let eleccionRepository: jest.Mocked<Repository<Eleccion>>;
  let blockchainService: jest.Mocked<BlockchainService>;
  let ofertaElectoralQueryService: jest.Mocked<OfertaElectoralQueryService>;
  let eleccionGateway: jest.Mocked<EleccionGateway>;

  const mockEleccion: Eleccion = {
    idEleccion: 1,
    nombre: 'Test Election',
    descripcion: 'Test Description',
    estado: EleccionEstado.CONFIGURADA,
    tipoVotacion: TipoVotacion.POR_LISTA,
    minimoCandidatosPorLista: null,
    fechaInicio: new Date('2026-07-15T10:00:00Z'),
    fechaFin: new Date('2026-07-15T18:00:00Z'),
    fechaCreacion: new Date(),
    fechaActualizacion: new Date(),
  };

  beforeEach(async () => {
    const mockRepository = {
      findOne: jest.fn(),
      save: jest.fn(),
    };

    const mockBlockchainService = {
      syncElectionState: jest.fn(),
      syncElectionWindow: jest.fn(),
      registerCandidates: jest.fn(),
      lockElectionWindow: jest.fn(),
      lockRevoteConfig: jest.fn(),
    };

    const mockOfertaElectoralQueryService = {
      obtenerOfertaPublicada: jest.fn().mockResolvedValue({
        listas: [
          { candidatos: [{ idCandidato: 101 }, { idCandidato: 102 }] },
          { candidatos: [{ idCandidato: 103 }] },
        ],
      }),
    };

    const mockEleccionGateway = {
      emitTransaccionEnProgreso: jest.fn(),
      emitTransaccionConflicto: jest.fn(),
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
        {
          provide: OfertaElectoralQueryService,
          useValue: mockOfertaElectoralQueryService,
        },
        {
          provide: EleccionGateway,
          useValue: mockEleccionGateway,
        },
      ],
    }).compile();

    service = module.get<ElectionStateService>(ElectionStateService);
    eleccionRepository = module.get(getRepositoryToken(Eleccion));
    blockchainService = module.get(BlockchainService);
    ofertaElectoralQueryService = module.get(OfertaElectoralQueryService);
    eleccionGateway = module.get(EleccionGateway);
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
      blockchainService.registerCandidates.mockResolvedValue({
        txHash: '0xcand',
        blockNumber: 12343,
        alreadySealed: false,
      });
      blockchainService.syncElectionWindow.mockResolvedValue({
        txHash: '0xwin',
        blockNumber: 12344,
      });
      blockchainService.lockElectionWindow.mockResolvedValue({
        txHash: '0xlockwin',
        blockNumber: 12344,
        alreadyLocked: false,
      });
      blockchainService.lockRevoteConfig.mockResolvedValue({
        txHash: '0xlockrevote',
        blockNumber: 12344,
        alreadyLocked: false,
      });
      blockchainService.syncElectionState.mockResolvedValue({
        txHash: '0xabc123',
        blockNumber: 12345,
      });

      const result = await service.transitionToAbierta(1);

      expect(eleccionRepository.findOne).toHaveBeenCalledWith({
        where: { idEleccion: 1 },
      });
      expect(
        ofertaElectoralQueryService.obtenerOfertaPublicada,
      ).toHaveBeenCalledWith(1);
      expect(blockchainService.registerCandidates).toHaveBeenCalledWith(
        1,
        [101, 102, 103],
      );
      expect(blockchainService.syncElectionWindow).toHaveBeenCalledWith(
        1,
        eleccion.fechaInicio,
        eleccion.fechaFin,
      );
      expect(blockchainService.lockElectionWindow).toHaveBeenCalledWith(1);
      expect(blockchainService.lockRevoteConfig).toHaveBeenCalledWith(1);
      expect(blockchainService.syncElectionState).toHaveBeenCalledWith(
        1,
        EleccionEstado.ABIERTA,
      );
      expect(eleccionRepository.save).toHaveBeenCalledWith({
        ...eleccion,
        estado: EleccionEstado.ABIERTA,
      });
      const registerOrder =
        blockchainService.registerCandidates.mock.invocationCallOrder[0];
      const windowOrder =
        blockchainService.syncElectionWindow.mock.invocationCallOrder[0];
      const lockWindowOrder =
        blockchainService.lockElectionWindow.mock.invocationCallOrder[0];
      const lockRevoteOrder =
        blockchainService.lockRevoteConfig.mock.invocationCallOrder[0];
      const syncOrder =
        blockchainService.syncElectionState.mock.invocationCallOrder[0];
      const saveOrder = eleccionRepository.save.mock.invocationCallOrder[0];
      expect(registerOrder).toBeLessThan(windowOrder);
      expect(windowOrder).toBeLessThan(lockWindowOrder);
      expect(windowOrder).toBeLessThan(lockRevoteOrder);
      expect(lockWindowOrder).toBeLessThan(syncOrder);
      expect(lockRevoteOrder).toBeLessThan(syncOrder);
      expect(syncOrder).toBeLessThan(saveOrder);
      expect(result.estado).toBe(EleccionEstado.ABIERTA);
      // VOTAR-481: feedback WebSocket de "transacción en curso" antes de tocar blockchain.
      expect(eleccionGateway.emitTransaccionEnProgreso).toHaveBeenCalledWith(
        1,
        'APERTURA',
      );
      const progressOrder =
        eleccionGateway.emitTransaccionEnProgreso.mock.invocationCallOrder[0];
      expect(progressOrder).toBeLessThan(registerOrder);
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
      // VOTAR-481: no debe avisar "en progreso" si la precondición de estado falla.
      expect(eleccionGateway.emitTransaccionEnProgreso).not.toHaveBeenCalled();
    });

    it('should not persist DB state when blockchain sync fails', async () => {
      const eleccion = { ...mockEleccion, estado: EleccionEstado.CONFIGURADA };
      eleccionRepository.findOne.mockResolvedValue(eleccion);
      blockchainService.registerCandidates.mockResolvedValue({
        txHash: '0xcand',
        blockNumber: 1,
        alreadySealed: false,
      });
      blockchainService.syncElectionWindow.mockResolvedValue({
        txHash: '0xwin',
        blockNumber: 1,
      });
      blockchainService.lockElectionWindow.mockResolvedValue({
        txHash: '0xlockwin',
        blockNumber: 1,
        alreadyLocked: false,
      });
      blockchainService.lockRevoteConfig.mockResolvedValue({
        txHash: '0xlockrevote',
        blockNumber: 1,
        alreadyLocked: false,
      });
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

    it('should not sync window/state when registerCandidates fails (VOTAR-345)', async () => {
      const eleccion = { ...mockEleccion, estado: EleccionEstado.CONFIGURADA };
      eleccionRepository.findOne.mockResolvedValue(eleccion);
      blockchainService.registerCandidates.mockRejectedValue(
        new ServiceUnavailableException('Blockchain error'),
      );

      await expect(service.transitionToAbierta(1)).rejects.toThrow(
        ServiceUnavailableException,
      );

      expect(blockchainService.syncElectionWindow).not.toHaveBeenCalled();
      expect(blockchainService.lockElectionWindow).not.toHaveBeenCalled();
      expect(blockchainService.lockRevoteConfig).not.toHaveBeenCalled();
      expect(blockchainService.syncElectionState).not.toHaveBeenCalled();
      expect(eleccionRepository.save).not.toHaveBeenCalled();
    });

    it('should not lock revote config or persist when lockElectionWindow fails (VOTAR-327)', async () => {
      const eleccion = { ...mockEleccion, estado: EleccionEstado.CONFIGURADA };
      eleccionRepository.findOne.mockResolvedValue(eleccion);
      blockchainService.registerCandidates.mockResolvedValue({
        txHash: '0xcand',
        blockNumber: 1,
        alreadySealed: false,
      });
      blockchainService.syncElectionWindow.mockResolvedValue({
        txHash: '0xwin',
        blockNumber: 1,
      });
      blockchainService.lockElectionWindow.mockRejectedValue(
        new ServiceUnavailableException('Blockchain error'),
      );

      await expect(service.transitionToAbierta(1)).rejects.toThrow(
        ServiceUnavailableException,
      );

      expect(blockchainService.lockRevoteConfig).not.toHaveBeenCalled();
      expect(blockchainService.syncElectionState).not.toHaveBeenCalled();
      expect(eleccionRepository.save).not.toHaveBeenCalled();
    });

    it('should not persist when lockRevoteConfig fails (VOTAR-327)', async () => {
      const eleccion = { ...mockEleccion, estado: EleccionEstado.CONFIGURADA };
      eleccionRepository.findOne.mockResolvedValue(eleccion);
      blockchainService.registerCandidates.mockResolvedValue({
        txHash: '0xcand',
        blockNumber: 1,
        alreadySealed: false,
      });
      blockchainService.syncElectionWindow.mockResolvedValue({
        txHash: '0xwin',
        blockNumber: 1,
      });
      blockchainService.lockElectionWindow.mockResolvedValue({
        txHash: '0xlockwin',
        blockNumber: 1,
        alreadyLocked: false,
      });
      blockchainService.lockRevoteConfig.mockRejectedValue(
        new ServiceUnavailableException('Blockchain error'),
      );

      await expect(service.transitionToAbierta(1)).rejects.toThrow(
        ServiceUnavailableException,
      );

      expect(blockchainService.syncElectionState).not.toHaveBeenCalled();
      expect(eleccionRepository.save).not.toHaveBeenCalled();
    });

    it('rejects a concurrent transition for the same election with ConflictException', async () => {
      const eleccion = { ...mockEleccion, estado: EleccionEstado.CONFIGURADA };
      eleccionRepository.findOne.mockResolvedValue(eleccion);
      eleccionRepository.save.mockResolvedValue({
        ...eleccion,
        estado: EleccionEstado.ABIERTA,
      });

      // Deja la primera llamada "colgada" a propósito, para simular que
      // sigue en curso cuando llega la segunda (ej. scheduler vs manual).
      let resolveRegisterCandidates: () => void;
      const pending = new Promise<void>((resolve) => {
        resolveRegisterCandidates = resolve;
      });
      blockchainService.registerCandidates.mockImplementation(async () => {
        await pending;
        return { txHash: '0xcand', blockNumber: 1, alreadySealed: false };
      });
      blockchainService.syncElectionWindow.mockResolvedValue({
        txHash: '0xwin',
        blockNumber: 1,
      });
      blockchainService.syncElectionState.mockResolvedValue({
        txHash: '0xabc',
        blockNumber: 1,
      });

      const firstCall = service.transitionToAbierta(1);

      // La segunda llamada, mientras la primera sigue en curso, debe
      // rechazarse inmediatamente sin tocar blockchain.
      await expect(service.transitionToAbierta(1)).rejects.toThrow(
        ConflictException,
      );
      await expect(service.transitionToAbierta(1)).rejects.toThrow(
        /transición de estado en curso/,
      );
      expect(blockchainService.registerCandidates).toHaveBeenCalledTimes(1);
      // VOTAR-481: el rechazo por lock debe avisarse por WebSocket, no solo
      // devolverse como 409 silencioso.
      expect(eleccionGateway.emitTransaccionConflicto).toHaveBeenCalledWith(
        1,
        'APERTURA',
        expect.stringMatching(/transición de estado en curso/),
      );

      // Libera la primera llamada y confirma que termina bien.
      resolveRegisterCandidates!();
      await expect(firstCall).resolves.toMatchObject({
        estado: EleccionEstado.ABIERTA,
      });

      // El lock debe haberse liberado tras completar la primera llamada:
      // un tercer intento ya no debe fallar por ConflictException (lock
      // trabado), sino por la regla de negocio normal (la elección ya no
      // está en CONFIGURADA, porque la primera llamada la abrió).
      await expect(service.transitionToAbierta(1)).rejects.toThrow(
        UnprocessableEntityException,
      );
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
      // VOTAR-481: feedback WebSocket de "transacción en curso" antes de tocar blockchain.
      expect(eleccionGateway.emitTransaccionEnProgreso).toHaveBeenCalledWith(
        1,
        'CIERRE',
      );
      const progressOrder =
        eleccionGateway.emitTransaccionEnProgreso.mock.invocationCallOrder[0];
      expect(progressOrder).toBeLessThan(syncOrder);
    });

    it('should throw when election is not in ABIERTA state', async () => {
      const eleccion = { ...mockEleccion, estado: EleccionEstado.CONFIGURADA };
      eleccionRepository.findOne.mockResolvedValue(eleccion);

      await expect(service.transitionToCerrada(1)).rejects.toThrow(
        UnprocessableEntityException,
      );
      expect(eleccionGateway.emitTransaccionEnProgreso).not.toHaveBeenCalled();
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

    it('rejects a concurrent cierre for the same election with ConflictException (VOTAR-481)', async () => {
      const eleccion = { ...mockEleccion, estado: EleccionEstado.ABIERTA };
      eleccionRepository.findOne.mockResolvedValue(eleccion);
      eleccionRepository.save.mockResolvedValue({
        ...eleccion,
        estado: EleccionEstado.CERRADA,
      });

      // Deja la primera llamada "colgada" a propósito, para simular que el
      // cierre automático del scheduler sigue en curso cuando llega un
      // intento de cierre manual para el mismo comicio.
      let resolveSync: () => void;
      const pending = new Promise<void>((resolve) => {
        resolveSync = resolve;
      });
      blockchainService.syncElectionState.mockImplementation(async () => {
        await pending;
        return { txHash: '0xdef456', blockNumber: 1 };
      });

      const firstCall = service.transitionToCerrada(1);

      await expect(service.transitionToCerrada(1)).rejects.toThrow(
        ConflictException,
      );
      expect(eleccionGateway.emitTransaccionConflicto).toHaveBeenCalledWith(
        1,
        'CIERRE',
        expect.stringMatching(/transición de estado en curso/),
      );
      expect(blockchainService.syncElectionState).toHaveBeenCalledTimes(1);

      resolveSync!();
      await expect(firstCall).resolves.toMatchObject({
        estado: EleccionEstado.CERRADA,
      });
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

  describe('transitionToArchivada', () => {
    it('should persist ARCHIVADA without touching the blockchain (VOTAR-322)', async () => {
      const eleccion = { ...mockEleccion, estado: EleccionEstado.CERRADA };
      eleccionRepository.findOne.mockResolvedValue(eleccion);
      eleccionRepository.save.mockResolvedValue({
        ...eleccion,
        estado: EleccionEstado.ARCHIVADA,
      });

      const result = await service.transitionToArchivada(1);

      expect(eleccionRepository.findOne).toHaveBeenCalledWith({
        where: { idEleccion: 1 },
      });
      expect(eleccionRepository.save).toHaveBeenCalledWith({
        ...eleccion,
        estado: EleccionEstado.ARCHIVADA,
      });
      expect(result.estado).toBe(EleccionEstado.ARCHIVADA);

      // AC2: aislamiento estricto de la capa blockchain — costo cero de gas.
      expect(blockchainService.syncElectionState).not.toHaveBeenCalled();
      expect(blockchainService.syncElectionWindow).not.toHaveBeenCalled();
      expect(blockchainService.registerCandidates).not.toHaveBeenCalled();
      expect(blockchainService.lockElectionWindow).not.toHaveBeenCalled();
      expect(blockchainService.lockRevoteConfig).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when election does not exist', async () => {
      eleccionRepository.findOne.mockResolvedValue(null);

      await expect(service.transitionToArchivada(999)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw UnprocessableEntityException when election is not in CERRADA state', async () => {
      const eleccion = { ...mockEleccion, estado: EleccionEstado.ABIERTA };
      eleccionRepository.findOne.mockResolvedValue(eleccion);

      await expect(service.transitionToArchivada(1)).rejects.toThrow(
        UnprocessableEntityException,
      );
      await expect(service.transitionToArchivada(1)).rejects.toThrow(
        /debe estar en estado CERRADA/,
      );
      expect(eleccionRepository.save).not.toHaveBeenCalled();
      expect(blockchainService.syncElectionState).not.toHaveBeenCalled();
    });
  });
});
