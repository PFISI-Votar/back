/* eslint-disable @typescript-eslint/unbound-method */
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { DeepPartial, Repository } from 'typeorm';
import { PausaComicioService } from './pausa-comicio.service';
import { Eleccion } from '@/eleccion/entities/eleccion.entity';
import { EleccionEstado } from '@/eleccion/enums/eleccion-estado.enum';
import { SolicitudPausa } from '@/eleccion/pausa/entities/solicitud-pausa.entity';
import { ConfirmacionPausa } from '@/eleccion/pausa/entities/confirmacion-pausa.entity';
import { SolicitudPausaTipo } from '@/eleccion/pausa/enums/solicitud-pausa-tipo.enum';
import { SolicitudPausaEstado } from '@/eleccion/pausa/enums/solicitud-pausa-estado.enum';
import { BlockchainService } from '@/blockchain/blockchain.service';
import { AuditLoggerService } from '@/audit/audit-logger.service';

jest.mock('@/eleccion/gateways/eleccion.gateway', () => ({
  EleccionGateway: class EleccionGateway {
    emitEleccionPausada = jest.fn();
    emitEleccionReanudada = jest.fn();
  },
}));

import { EleccionGateway } from '@/eleccion/gateways/eleccion.gateway';

describe('PausaComicioService', () => {
  let service: PausaComicioService;
  let eleccionRepository: jest.Mocked<Repository<Eleccion>>;
  let solicitudRepository: jest.Mocked<Repository<SolicitudPausa>>;
  let confirmacionRepository: jest.Mocked<Repository<ConfirmacionPausa>>;
  let blockchainService: jest.Mocked<BlockchainService>;
  let auditLoggerService: jest.Mocked<AuditLoggerService>;
  let eleccionGateway: jest.Mocked<EleccionGateway>;

  const mockEleccion: Eleccion = {
    idEleccion: 1,
    nombre: 'Test Election',
    estado: EleccionEstado.ABIERTA,
    pausada: false,
    pausadaEn: null,
    fechaInicio: new Date('2026-01-01T10:00:00Z'),
    fechaFin: new Date('2026-01-01T18:00:00Z'),
  } as Eleccion;

  const mockSolicitudPendiente: SolicitudPausa = {
    idSolicitud: 10,
    idEleccion: 1,
    tipo: SolicitudPausaTipo.PAUSAR,
    razon: 'Incidente de seguridad',
    estado: SolicitudPausaEstado.PENDIENTE,
    creadoPorHash: 'hash-admin-1',
    creadoEn: new Date(),
    ejecutadoEn: null,
    txHashBallot: null,
    txHashVoteRegistry: null,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PausaComicioService,
        {
          provide: getRepositoryToken(Eleccion),
          useValue: { findOne: jest.fn(), save: jest.fn() },
        },
        {
          provide: getRepositoryToken(SolicitudPausa),
          useValue: {
            findOne: jest.fn(),
            save: jest.fn(),
            create: jest
              .fn()
              .mockImplementation((dto: DeepPartial<SolicitudPausa>) => dto),
          },
        },
        {
          provide: getRepositoryToken(ConfirmacionPausa),
          useValue: {
            findOne: jest.fn(),
            save: jest.fn(),
            create: jest
              .fn()
              .mockImplementation((dto: DeepPartial<ConfirmacionPausa>) => dto),
            count: jest.fn(),
          },
        },
        {
          provide: BlockchainService,
          useValue: { pauseElection: jest.fn(), unpauseElection: jest.fn() },
        },
        {
          provide: AuditLoggerService,
          useValue: {
            ofuscarOperador: jest.fn((actorId: string) => `hash-${actorId}`),
            logComicioPausado: jest.fn(),
            logComicioReanudado: jest.fn(),
          },
        },
        {
          provide: EleccionGateway,
          useValue: {
            emitEleccionPausada: jest.fn(),
            emitEleccionReanudada: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue(2) },
        },
      ],
    }).compile();

    service = module.get(PausaComicioService);
    eleccionRepository = module.get(getRepositoryToken(Eleccion));
    solicitudRepository = module.get(getRepositoryToken(SolicitudPausa));
    confirmacionRepository = module.get(getRepositoryToken(ConfirmacionPausa));
    blockchainService = module.get(BlockchainService);
    auditLoggerService = module.get(AuditLoggerService);
    eleccionGateway = module.get(EleccionGateway);
  });

  describe('solicitarPausa', () => {
    it('primera confirmación crea la solicitud y no ejecuta on-chain (1/2)', async () => {
      eleccionRepository.findOne.mockResolvedValue({ ...mockEleccion });
      solicitudRepository.findOne.mockResolvedValue(null);
      solicitudRepository.save.mockResolvedValue({ ...mockSolicitudPendiente });
      confirmacionRepository.findOne.mockResolvedValue(null);
      confirmacionRepository.count.mockResolvedValue(1);

      const result = await service.solicitarPausa(
        1,
        'admin-1',
        'Incidente de seguridad',
        '127.0.0.1',
      );

      expect(solicitudRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          idEleccion: 1,
          tipo: SolicitudPausaTipo.PAUSAR,
        }),
      );
      expect(confirmacionRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ idSolicitud: 10, actorHash: 'hash-admin-1' }),
      );
      expect(blockchainService.pauseElection).not.toHaveBeenCalled();
      expect(result).toMatchObject({
        confirmaciones: 1,
        requeridas: 2,
        ejecutada: false,
      });
    });

    it('segunda confirmación de una autoridad distinta alcanza el umbral y ejecuta on-chain', async () => {
      eleccionRepository.findOne.mockResolvedValue({ ...mockEleccion });
      solicitudRepository.findOne.mockResolvedValue({
        ...mockSolicitudPendiente,
      });
      confirmacionRepository.findOne.mockResolvedValue(null);
      confirmacionRepository.count.mockResolvedValue(2);
      blockchainService.pauseElection.mockResolvedValue({
        ballotTxHash: '0xballot',
        voteRegistryTxHash: '0xregistry',
        ballotAlreadyPaused: false,
        voteRegistryAlreadyPaused: false,
      });

      const result = await service.solicitarPausa(
        1,
        'admin-2',
        'Incidente de seguridad',
        '127.0.0.1',
      );

      expect(blockchainService.pauseElection).toHaveBeenCalledWith(
        1,
        'Incidente de seguridad',
      );
      expect(eleccionRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ pausada: true }),
      );
      expect(solicitudRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ estado: SolicitudPausaEstado.EJECUTADA }),
      );
      expect(auditLoggerService.logComicioPausado).toHaveBeenCalledWith(
        expect.objectContaining({
          idEleccion: 1,
          actorId: 'admin-2',
          confirmaciones: 2,
          txHashBallot: '0xballot',
          txHashVoteRegistry: '0xregistry',
        }),
      );
      expect(eleccionGateway.emitEleccionPausada).toHaveBeenCalledWith(
        1,
        'Incidente de seguridad',
      );
      expect(result).toMatchObject({
        confirmaciones: 2,
        requeridas: 2,
        ejecutada: true,
        txHashBallot: '0xballot',
        txHashVoteRegistry: '0xregistry',
      });
    });

    it('reintenta la ejecución on-chain si el umbral ya se había alcanzado pero la tx anterior falló', async () => {
      eleccionRepository.findOne.mockResolvedValue({ ...mockEleccion });
      solicitudRepository.findOne.mockResolvedValue({
        ...mockSolicitudPendiente,
      });
      confirmacionRepository.count.mockResolvedValue(2); // umbral (2) ya alcanzado
      blockchainService.pauseElection.mockResolvedValue({
        ballotTxHash: '0xretry-ballot',
        voteRegistryTxHash: '0xretry-registry',
        ballotAlreadyPaused: false,
        voteRegistryAlreadyPaused: false,
      });

      const result = await service.solicitarPausa(
        1,
        'admin-1',
        'Incidente de seguridad',
        '127.0.0.1',
      );

      // No exige una confirmación nueva: es un reintento de una tx ya aprobada.
      expect(confirmacionRepository.findOne).not.toHaveBeenCalled();
      expect(confirmacionRepository.save).not.toHaveBeenCalled();
      expect(blockchainService.pauseElection).toHaveBeenCalledWith(
        1,
        'Incidente de seguridad',
      );
      expect(result).toMatchObject({
        ejecutada: true,
        confirmaciones: 2,
        requeridas: 2,
        txHashBallot: '0xretry-ballot',
      });
    });

    it('rechaza si la misma autoridad confirma dos veces', async () => {
      eleccionRepository.findOne.mockResolvedValue({ ...mockEleccion });
      solicitudRepository.findOne.mockResolvedValue({
        ...mockSolicitudPendiente,
      });
      confirmacionRepository.findOne.mockResolvedValue({
        idConfirmacion: 1,
        idSolicitud: 10,
        actorHash: 'hash-admin-1',
      } as ConfirmacionPausa);

      await expect(
        service.solicitarPausa(1, 'admin-1', 'Incidente', '127.0.0.1'),
      ).rejects.toThrow(ConflictException);
      expect(blockchainService.pauseElection).not.toHaveBeenCalled();
    });

    it('rechaza si el comicio no está ABIERTA', async () => {
      eleccionRepository.findOne.mockResolvedValue({
        ...mockEleccion,
        estado: EleccionEstado.CONFIGURADA,
      });

      await expect(
        service.solicitarPausa(1, 'admin-1', 'Incidente', '127.0.0.1'),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('rechaza si el comicio ya está pausado', async () => {
      eleccionRepository.findOne.mockResolvedValue({
        ...mockEleccion,
        pausada: true,
      });

      await expect(
        service.solicitarPausa(1, 'admin-1', 'Incidente', '127.0.0.1'),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('rechaza si el comicio no existe', async () => {
      eleccionRepository.findOne.mockResolvedValue(null);

      await expect(
        service.solicitarPausa(99, 'admin-1', 'Incidente', '127.0.0.1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('solicitarReanudacion', () => {
    it('rechaza reanudar un comicio que no está pausado', async () => {
      eleccionRepository.findOne.mockResolvedValue({
        ...mockEleccion,
        pausada: false,
      });

      await expect(
        service.solicitarReanudacion(
          1,
          'admin-1',
          'Incidente resuelto',
          '127.0.0.1',
        ),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('ejecuta on-chain al alcanzar el umbral', async () => {
      eleccionRepository.findOne.mockResolvedValue({
        ...mockEleccion,
        pausada: true,
      });
      solicitudRepository.findOne.mockResolvedValue({
        ...mockSolicitudPendiente,
        tipo: SolicitudPausaTipo.REANUDAR,
        razon: 'Incidente resuelto',
      });
      confirmacionRepository.findOne.mockResolvedValue(null);
      confirmacionRepository.count.mockResolvedValue(2);
      blockchainService.unpauseElection.mockResolvedValue({
        ballotTxHash: '0xballot2',
        voteRegistryTxHash: '0xregistry2',
        ballotAlreadyUnpaused: false,
        voteRegistryAlreadyUnpaused: false,
      });

      const result = await service.solicitarReanudacion(
        1,
        'admin-2',
        'Incidente resuelto',
        '127.0.0.1',
      );

      expect(blockchainService.unpauseElection).toHaveBeenCalledWith(1);
      expect(eleccionRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ pausada: false, pausadaEn: null }),
      );
      expect(eleccionGateway.emitEleccionReanudada).toHaveBeenCalledWith(1);
      expect(auditLoggerService.logComicioReanudado).toHaveBeenCalledWith(
        expect.objectContaining({
          idEleccion: 1,
          actorId: 'admin-2',
          razon: 'Incidente resuelto',
          txHashBallot: '0xballot2',
          txHashVoteRegistry: '0xregistry2',
        }),
      );
      expect(result).toMatchObject({ ejecutada: true });
    });
  });
});
