/* eslint-disable @typescript-eslint/unbound-method */
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import {
  NotFoundException,
  PreconditionFailedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Repository } from 'typeorm';
import { AperturaComicioService } from './apertura-comicio.service';
import { Eleccion } from '@/eleccion/entities/eleccion.entity';
import { EleccionEstado } from '@/eleccion/enums/eleccion-estado.enum';
import { ElectionStateService } from '@/eleccion/services/election-state.service';
import { PadronElectoral } from '@/padron/entities/padron-electoral.entity';
import { MerkleTree } from '@/padron/entities/merkle-tree.entity';
import { MerkleTreeEstado } from '@/padron/enums/merkle-tree-estado.enum';
import { EleccionGateway } from '@/eleccion/gateways/eleccion.gateway';

describe('AperturaComicioService', () => {
  let service: AperturaComicioService;
  let eleccionRepository: jest.Mocked<Repository<Eleccion>>;
  let padronRepository: jest.Mocked<Repository<PadronElectoral>>;
  let merkleTreeRepository: jest.Mocked<Repository<MerkleTree>>;
  let electionStateService: jest.Mocked<ElectionStateService>;
  let configService: jest.Mocked<ConfigService>;
  let eleccionGateway: jest.Mocked<EleccionGateway>;

  const mockEleccion: Eleccion = {
    idEleccion: 1,
    nombre: 'Test Election',
    descripcion: 'Test Description',
    estado: EleccionEstado.CONFIGURADA,
    fechaInicio: new Date('2026-01-01T10:00:00Z'),
    fechaFin: new Date('2026-01-01T18:00:00Z'),
    tipoVotacion: 'UNICA_LISTA',
    fechaCreacion: new Date(),
    fechaActualizacion: new Date(),
  } as Eleccion;

  const mockPadron: PadronElectoral = {
    idPadron: 1,
    totalVotantesHabilitados: 100,
    hashPadron: '0xabc123',
  } as PadronElectoral;

  const mockMerkleTree: MerkleTree = {
    idMerkleTree: 1,
    merkleRoot: '0x1234567890abcdef',
    estado: MerkleTreeEstado.PUBLICADO_ON_CHAIN,
    totalHojas: 100,
  } as MerkleTree;

  beforeEach(async () => {
    const mockEleccionRepository = {
      findOne: jest.fn(),
      save: jest.fn(),
    };

    const mockPadronRepository = {
      findOne: jest.fn(),
    };

    const mockMerkleTreeRepository = {
      findOne: jest.fn(),
    };

    const mockElectionStateService = {
      transitionToAbierta: jest.fn(),
    };

    const mockConfigService = {
      get: jest.fn(),
    };

    const mockEleccionGateway = {
      emitEleccionAbierta: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AperturaComicioService,
        {
          provide: getRepositoryToken(Eleccion),
          useValue: mockEleccionRepository,
        },
        {
          provide: getRepositoryToken(PadronElectoral),
          useValue: mockPadronRepository,
        },
        {
          provide: getRepositoryToken(MerkleTree),
          useValue: mockMerkleTreeRepository,
        },
        {
          provide: ElectionStateService,
          useValue: mockElectionStateService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: EleccionGateway,
          useValue: mockEleccionGateway,
        },
      ],
    }).compile();

    service = module.get<AperturaComicioService>(AperturaComicioService);
    eleccionRepository = module.get(getRepositoryToken(Eleccion));
    padronRepository = module.get(getRepositoryToken(PadronElectoral));
    merkleTreeRepository = module.get(getRepositoryToken(MerkleTree));
    electionStateService = module.get(ElectionStateService);
    configService = module.get(ConfigService);
    eleccionGateway = module.get(EleccionGateway);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('abrirManual', () => {
    it('should open election manually when all preconditions are met', async () => {
      // Arrange: Setup preconditions
      eleccionRepository.findOne.mockResolvedValue(mockEleccion);
      padronRepository.findOne.mockResolvedValue(mockPadron);
      merkleTreeRepository.findOne.mockResolvedValue(mockMerkleTree);
      configService.get.mockImplementation((key: string) => {
        if (key === 'SEPOLIA_RPC_URL') return 'http://localhost:8545';
        if (key === 'MERKLE_ROOT_STORE_ADDRESS') return '0xContractAddress';
        return null;
      });

      // Mock blockchain verification (will be bypassed in unit tests)
      const mockContract = {
        getRoot: jest.fn().mockResolvedValue('0x1234567890abcdef'),
      };
      jest.spyOn(service as any, 'verifyMerkleRootOnChain').mockResolvedValue(undefined);

      const eleccionAbierta = { ...mockEleccion, estado: EleccionEstado.ABIERTA };
      electionStateService.transitionToAbierta.mockResolvedValue(eleccionAbierta);

      // Act
      const result = await service.abrirManual(1);

      // Assert
      expect(electionStateService.transitionToAbierta).toHaveBeenCalledWith(1);
      expect(eleccionGateway.emitEleccionAbierta).toHaveBeenCalledWith(
        eleccionAbierta.idEleccion,
        eleccionAbierta.nombre,
      );
      expect(result.estado).toBe(EleccionEstado.ABIERTA);
    });

    it('should throw NotFoundException when election does not exist', async () => {
      eleccionRepository.findOne.mockResolvedValue(null);

      await expect(service.abrirManual(999)).rejects.toThrow(NotFoundException);
      await expect(service.abrirManual(999)).rejects.toThrow(
        'Elección 999 no encontrada',
      );
    });

    it('should throw UnprocessableEntityException when election is not in CONFIGURADA state', async () => {
      const eleccion = { ...mockEleccion, estado: EleccionEstado.BORRADOR };
      eleccionRepository.findOne.mockResolvedValue(eleccion);

      await expect(service.abrirManual(1)).rejects.toThrow(
        UnprocessableEntityException,
      );
      await expect(service.abrirManual(1)).rejects.toThrow(
        /debe estar en estado CONFIGURADA/,
      );
    });

    it('should throw PreconditionFailedException when padron is not loaded', async () => {
      eleccionRepository.findOne.mockResolvedValue(mockEleccion);
      padronRepository.findOne.mockResolvedValue(null);

      await expect(service.abrirManual(1)).rejects.toThrow(
        PreconditionFailedException,
      );
      await expect(service.abrirManual(1)).rejects.toThrow(
        /padrón electoral no ha sido cargado/,
      );
    });

    it('should throw PreconditionFailedException when padron is empty', async () => {
      eleccionRepository.findOne.mockResolvedValue(mockEleccion);
      padronRepository.findOne.mockResolvedValue({
        ...mockPadron,
        totalVotantesHabilitados: 0,
      });

      await expect(service.abrirManual(1)).rejects.toThrow(
        PreconditionFailedException,
      );
      await expect(service.abrirManual(1)).rejects.toThrow(
        /padrón electoral está vacío/,
      );
    });

    it('should throw PreconditionFailedException when Merkle tree does not exist', async () => {
      eleccionRepository.findOne.mockResolvedValue(mockEleccion);
      padronRepository.findOne.mockResolvedValue(mockPadron);
      merkleTreeRepository.findOne.mockResolvedValue(null);

      await expect(service.abrirManual(1)).rejects.toThrow(
        PreconditionFailedException,
      );
      await expect(service.abrirManual(1)).rejects.toThrow(
        /árbol de Merkle no ha sido generado/,
      );
    });

    it('should throw PreconditionFailedException when Merkle tree is not PUBLICADO_ON_CHAIN', async () => {
      eleccionRepository.findOne.mockResolvedValue(mockEleccion);
      padronRepository.findOne.mockResolvedValue(mockPadron);
      merkleTreeRepository.findOne.mockResolvedValue({
        ...mockMerkleTree,
        estado: MerkleTreeEstado.GENERADO,
      });

      await expect(service.abrirManual(1)).rejects.toThrow(
        PreconditionFailedException,
      );
      await expect(service.abrirManual(1)).rejects.toThrow(
        /debe estar en estado PUBLICADO_ON_CHAIN/,
      );
    });

    it('should throw PreconditionFailedException when RPC is not configured', async () => {
      eleccionRepository.findOne.mockResolvedValue(mockEleccion);
      padronRepository.findOne.mockResolvedValue(mockPadron);
      merkleTreeRepository.findOne.mockResolvedValue(mockMerkleTree);
      configService.get.mockReturnValue(null);

      await expect(service.abrirManual(1)).rejects.toThrow(
        PreconditionFailedException,
      );
      await expect(service.abrirManual(1)).rejects.toThrow(
        /verificación on-chain no está configurada/,
      );
    });
  });

  describe('abrirAutomatico', () => {
    it('should open election automatically when fechaInicio is reached', async () => {
      // Arrange: Setup preconditions with fechaInicio in the past
      const pastDate = new Date('2024-01-01T10:00:00Z');
      const eleccionPasada = { ...mockEleccion, fechaInicio: pastDate };

      eleccionRepository.findOne.mockResolvedValue(eleccionPasada);
      padronRepository.findOne.mockResolvedValue(mockPadron);
      merkleTreeRepository.findOne.mockResolvedValue(mockMerkleTree);
      configService.get.mockImplementation((key: string) => {
        if (key === 'SEPOLIA_RPC_URL') return 'http://localhost:8545';
        if (key === 'MERKLE_ROOT_STORE_ADDRESS') return '0xContractAddress';
        return null;
      });

      jest.spyOn(service as any, 'verifyMerkleRootOnChain').mockResolvedValue(undefined);

      const eleccionAbierta = { ...eleccionPasada, estado: EleccionEstado.ABIERTA };
      electionStateService.transitionToAbierta.mockResolvedValue(eleccionAbierta);

      // Act
      const result = await service.abrirAutomatico(1);

      // Assert
      expect(electionStateService.transitionToAbierta).toHaveBeenCalledWith(1);
      expect(eleccionGateway.emitEleccionAbierta).toHaveBeenCalledWith(
        eleccionAbierta.idEleccion,
        eleccionAbierta.nombre,
      );
      expect(result.estado).toBe(EleccionEstado.ABIERTA);
    });

    it('should throw UnprocessableEntityException when fechaInicio has not been reached', async () => {
      // Arrange: Setup election with future fechaInicio
      const futureDate = new Date('2030-01-01T10:00:00Z');
      const eleccionFutura = { ...mockEleccion, fechaInicio: futureDate };

      eleccionRepository.findOne.mockResolvedValue(eleccionFutura);
      padronRepository.findOne.mockResolvedValue(mockPadron);
      merkleTreeRepository.findOne.mockResolvedValue(mockMerkleTree);
      configService.get.mockImplementation((key: string) => {
        if (key === 'SEPOLIA_RPC_URL') return 'http://localhost:8545';
        if (key === 'MERKLE_ROOT_STORE_ADDRESS') return '0xContractAddress';
        return null;
      });

      jest.spyOn(service as any, 'verifyMerkleRootOnChain').mockResolvedValue(undefined);

      // Act & Assert
      await expect(service.abrirAutomatico(1)).rejects.toThrow(
        UnprocessableEntityException,
      );
      await expect(service.abrirAutomatico(1)).rejects.toThrow(
        /fecha de inicio no ha sido alcanzada/,
      );
    });
  });
});
