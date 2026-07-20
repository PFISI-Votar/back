/* eslint-disable @typescript-eslint/unbound-method */
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  NotFoundException,
  PreconditionFailedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Repository } from 'typeorm';
import { AperturaComicioService } from './apertura-comicio.service';
import { Eleccion } from '@/eleccion/entities/eleccion.entity';
import { EleccionEstado } from '@/eleccion/enums/eleccion-estado.enum';
import { ConfiguracionComicio } from '@/eleccion/configuracion-comicio/entities/configuracion-comicio.entity';
import { ElectionStateService } from '@/eleccion/services/election-state.service';
import { PadronElectoral } from '@/padron/entities/padron-electoral.entity';
import { MerkleTree } from '@/padron/entities/merkle-tree.entity';
import { MerkleTreeEstado } from '@/padron/enums/merkle-tree-estado.enum';
import { EleccionGateway } from '@/eleccion/gateways/eleccion.gateway';
import { BlockchainService } from '@/blockchain/blockchain.service';
import { AuditLoggerService } from '@/audit/audit-logger.service';

describe('AperturaComicioService', () => {
  let service: AperturaComicioService;
  let eleccionRepository: jest.Mocked<Repository<Eleccion>>;
  let padronRepository: jest.Mocked<Repository<PadronElectoral>>;
  let merkleTreeRepository: jest.Mocked<Repository<MerkleTree>>;
  let configuracionRepository: jest.Mocked<Repository<ConfiguracionComicio>>;
  let electionStateService: jest.Mocked<ElectionStateService>;
  let blockchainService: jest.Mocked<BlockchainService>;
  let auditLoggerService: jest.Mocked<AuditLoggerService>;
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

  const mockConfig: ConfiguracionComicio = {
    idConfiguracion: 1,
    idEleccion: 1,
    mostrarResultadosTiempoReal: false,
  } as ConfiguracionComicio;

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

    const mockConfiguracionRepository = {
      findOne: jest.fn(),
      save: jest.fn(),
    };

    const mockElectionStateService = {
      transitionToAbierta: jest.fn(),
    };

    const mockBlockchainService = {
      verifyMerkleRootOnChain: jest.fn(),
    };

    const mockAuditLoggerService = {
      logComicioAbierto: jest.fn(),
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
          provide: getRepositoryToken(ConfiguracionComicio),
          useValue: mockConfiguracionRepository,
        },
        {
          provide: ElectionStateService,
          useValue: mockElectionStateService,
        },
        {
          provide: BlockchainService,
          useValue: mockBlockchainService,
        },
        {
          provide: AuditLoggerService,
          useValue: mockAuditLoggerService,
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
    configuracionRepository = module.get(
      getRepositoryToken(ConfiguracionComicio),
    );
    electionStateService = module.get(ElectionStateService);
    blockchainService = module.get(BlockchainService);
    auditLoggerService = module.get(AuditLoggerService);
    eleccionGateway = module.get(EleccionGateway);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('abrirManual', () => {
    it('should open election manually when all preconditions are met (UAT-01)', async () => {
      eleccionRepository.findOne.mockResolvedValue(mockEleccion);
      padronRepository.findOne.mockResolvedValue(mockPadron);
      merkleTreeRepository.findOne.mockResolvedValue(mockMerkleTree);
      blockchainService.verifyMerkleRootOnChain.mockResolvedValue(true);
      configuracionRepository.findOne.mockResolvedValue({ ...mockConfig });
      configuracionRepository.save.mockImplementation(async (entity) => entity);

      const eleccionAbierta = {
        ...mockEleccion,
        estado: EleccionEstado.ABIERTA,
      };
      electionStateService.transitionToAbierta.mockResolvedValue(
        eleccionAbierta,
      );
      auditLoggerService.logComicioAbierto.mockResolvedValue(undefined);

      const result = await service.abrirManual(1, 'admin-123', '192.168.1.1');

      expect(electionStateService.transitionToAbierta).toHaveBeenCalledWith(1);
      expect(configuracionRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ mostrarResultadosTiempoReal: true }),
      );
      expect(auditLoggerService.logComicioAbierto).toHaveBeenCalledWith({
        idEleccion: 1,
        actorId: 'admin-123',
        modo: 'MANUAL',
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        timestamp: expect.any(Date),
        ipOrigen: '192.168.1.1',
      });
      expect(eleccionGateway.emitEleccionAbierta).toHaveBeenCalledWith(
        eleccionAbierta.idEleccion,
      );
      expect(result.estado).toBe(EleccionEstado.ABIERTA);
      expect(result.modo).toBe('MANUAL');
    });

    it('should throw NotFoundException when election does not exist', async () => {
      eleccionRepository.findOne.mockResolvedValue(null);

      await expect(service.abrirManual(999, 'admin-123')).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.abrirManual(999, 'admin-123')).rejects.toThrow(
        'Elección 999 no encontrada',
      );
    });

    it('should throw UnprocessableEntityException when election is not in CONFIGURADA state', async () => {
      const eleccion = { ...mockEleccion, estado: EleccionEstado.BORRADOR };
      eleccionRepository.findOne.mockResolvedValue(eleccion);

      await expect(service.abrirManual(1, 'admin-123')).rejects.toThrow(
        UnprocessableEntityException,
      );
      await expect(service.abrirManual(1, 'admin-123')).rejects.toThrow(
        /debe estar en estado CONFIGURADA/,
      );
    });

    it('should throw PreconditionFailedException when padron is not loaded', async () => {
      eleccionRepository.findOne.mockResolvedValue(mockEleccion);
      padronRepository.findOne.mockResolvedValue(null);

      await expect(service.abrirManual(1, 'admin-123')).rejects.toThrow(
        PreconditionFailedException,
      );
      await expect(service.abrirManual(1, 'admin-123')).rejects.toThrow(
        /padrón electoral cargado/,
      );
    });

    it('should throw PreconditionFailedException when Merkle tree does not exist', async () => {
      eleccionRepository.findOne.mockResolvedValue(mockEleccion);
      padronRepository.findOne.mockResolvedValue(mockPadron);
      merkleTreeRepository.findOne.mockResolvedValue(null);

      await expect(service.abrirManual(1, 'admin-123')).rejects.toThrow(
        PreconditionFailedException,
      );
      await expect(service.abrirManual(1, 'admin-123')).rejects.toThrow(
        /árbol de Merkle consolidado/,
      );
    });

    it('should throw PreconditionFailedException when Merkle tree is not PUBLICADO_ON_CHAIN (UAT-02)', async () => {
      eleccionRepository.findOne.mockResolvedValue(mockEleccion);
      padronRepository.findOne.mockResolvedValue(mockPadron);
      merkleTreeRepository.findOne.mockResolvedValue({
        ...mockMerkleTree,
        estado: MerkleTreeEstado.GENERADO,
      });

      await expect(service.abrirManual(1, 'admin-123')).rejects.toThrow(
        PreconditionFailedException,
      );
      await expect(service.abrirManual(1, 'admin-123')).rejects.toThrow(
        /Raíz de Merkle no detectada en la red descentralizada/,
      );
    });

    it('should throw PreconditionFailedException when Merkle root is not verified on-chain (UAT-02)', async () => {
      eleccionRepository.findOne.mockResolvedValue(mockEleccion);
      padronRepository.findOne.mockResolvedValue(mockPadron);
      merkleTreeRepository.findOne.mockResolvedValue(mockMerkleTree);
      blockchainService.verifyMerkleRootOnChain.mockResolvedValue(false);

      await expect(service.abrirManual(1, 'admin-123')).rejects.toThrow(
        PreconditionFailedException,
      );
      await expect(service.abrirManual(1, 'admin-123')).rejects.toThrow(
        /La raíz de Merkle no pudo ser verificada en la blockchain/,
      );
    });
  });

  describe('abrirAutomatico', () => {
    it('should open election automatically when preconditions are met (UAT-03)', async () => {
      eleccionRepository.findOne.mockResolvedValue(mockEleccion);
      padronRepository.findOne.mockResolvedValue(mockPadron);
      merkleTreeRepository.findOne.mockResolvedValue(mockMerkleTree);
      blockchainService.verifyMerkleRootOnChain.mockResolvedValue(true);
      configuracionRepository.findOne.mockResolvedValue({ ...mockConfig });
      configuracionRepository.save.mockImplementation(async (entity) => entity);

      const eleccionAbierta = {
        ...mockEleccion,
        estado: EleccionEstado.ABIERTA,
      };
      electionStateService.transitionToAbierta.mockResolvedValue(
        eleccionAbierta,
      );
      auditLoggerService.logComicioAbierto.mockResolvedValue(undefined);

      const result = await service.abrirAutomatico(1);

      expect(electionStateService.transitionToAbierta).toHaveBeenCalledWith(1);
      expect(configuracionRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ mostrarResultadosTiempoReal: true }),
      );
      expect(auditLoggerService.logComicioAbierto).toHaveBeenCalledWith({
        idEleccion: 1,
        actorId: 'SYSTEM',
        modo: 'AUTOMATICO',
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        timestamp: expect.any(Date),
      });
      expect(eleccionGateway.emitEleccionAbierta).toHaveBeenCalledWith(
        eleccionAbierta.idEleccion,
      );
      expect(result.estado).toBe(EleccionEstado.ABIERTA);
      expect(result.modo).toBe('AUTOMATICO');
    });
  });
});
