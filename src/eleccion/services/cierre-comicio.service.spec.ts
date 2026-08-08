/* eslint-disable @typescript-eslint/unbound-method */
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Repository } from 'typeorm';
import { CierreComicioService } from './cierre-comicio.service';
import { Eleccion } from '@/eleccion/entities/eleccion.entity';
import { EleccionEstado } from '@/eleccion/enums/eleccion-estado.enum';
import { ElectionStateService } from '@/eleccion/services/election-state.service';
import { ConfiguracionComicio } from '@/eleccion/configuracion-comicio/entities/configuracion-comicio.entity';
import { AuditLoggerService } from '@/audit/audit-logger.service';
import { ParticipacionSnapshot } from '@/dashboard-publico/entities/participacion-snapshot.entity';
import { BlockchainService } from '@/blockchain/blockchain.service';
import { DeepPartial } from 'typeorm';

jest.mock('@/eleccion/gateways/eleccion.gateway', () => ({
  EleccionGateway: class EleccionGateway {
    emitEleccionCerrada = jest.fn();
  },
}));

import { EleccionGateway } from '@/eleccion/gateways/eleccion.gateway';

describe('CierreComicioService', () => {
  let service: CierreComicioService;
  let eleccionRepository: jest.Mocked<Repository<Eleccion>>;
  let configuracionRepository: jest.Mocked<Repository<ConfiguracionComicio>>;
  let snapshotRepository: jest.Mocked<Repository<ParticipacionSnapshot>>;
  let electionStateService: jest.Mocked<ElectionStateService>;
  let auditLoggerService: jest.Mocked<AuditLoggerService>;
  let eleccionGateway: jest.Mocked<EleccionGateway>;
  let blockchainService: jest.Mocked<BlockchainService>;

  const mockEleccion: Eleccion = {
    idEleccion: 1,
    nombre: 'Test Election',
    descripcion: 'Test Description',
    estado: EleccionEstado.ABIERTA,
    fechaInicio: new Date('2026-01-01T10:00:00Z'),
    fechaFin: new Date('2026-01-01T18:00:00Z'),
    tipoVotacion: 'UNICA_LISTA',
    fechaCreacion: new Date(),
    fechaActualizacion: new Date(),
  } as Eleccion;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CierreComicioService,
        {
          provide: getRepositoryToken(Eleccion),
          useValue: { findOne: jest.fn(), save: jest.fn() },
        },
        {
          provide: getRepositoryToken(ConfiguracionComicio),
          useValue: { findOne: jest.fn(), save: jest.fn() },
        },
        {
          provide: getRepositoryToken(ParticipacionSnapshot),
          useValue: {
            existsBy: jest.fn(),
            save: jest.fn(),
            create: jest
              .fn()
              .mockImplementation(
                (dto: DeepPartial<ParticipacionSnapshot>) => dto,
              ),
          },
        },
        {
          provide: ElectionStateService,
          useValue: { transitionToCerrada: jest.fn() },
        },
        {
          provide: AuditLoggerService,
          useValue: { logComicioCerrado: jest.fn() },
        },
        {
          provide: EleccionGateway,
          useValue: { emitEleccionCerrada: jest.fn() },
        },
        {
          provide: BlockchainService,
          useValue: { getParticipationStats: jest.fn() },
        },
      ],
    }).compile();

    service = module.get(CierreComicioService);
    eleccionRepository = module.get(getRepositoryToken(Eleccion));
    configuracionRepository = module.get(
      getRepositoryToken(ConfiguracionComicio),
    );
    snapshotRepository = module.get(getRepositoryToken(ParticipacionSnapshot));
    electionStateService = module.get(ElectionStateService);
    auditLoggerService = module.get(AuditLoggerService);
    eleccionGateway = module.get(EleccionGateway);
    blockchainService = module.get(BlockchainService);
  });

  it('cierra manualmente, congela snapshot y emite evento', async () => {
    eleccionRepository.findOne.mockResolvedValue(mockEleccion);
    electionStateService.transitionToCerrada.mockResolvedValue({
      ...mockEleccion,
      estado: EleccionEstado.CERRADA,
    });
    configuracionRepository.findOne.mockResolvedValue({
      idEleccion: 1,
      mostrarResultadosTiempoReal: true,
    } as ConfiguracionComicio);

    snapshotRepository.existsBy.mockResolvedValue(false);
    blockchainService.getParticipationStats.mockResolvedValue({
      totalVotes: 50,
      blankVotes: 2,
      nullVotes: 1,
    });

    const result = await service.cerrarManual(1, 'admin-1', '127.0.0.1');

    expect(electionStateService.transitionToCerrada).toHaveBeenCalledWith(1);
    expect(configuracionRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ mostrarResultadosTiempoReal: false }),
    );
    expect(snapshotRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        idEleccion: 1,
        totalVotos: 50,
        votosBlanco: 2,
        votosNulo: 1,
        congelado: true,
      }),
    );
    expect(auditLoggerService.logComicioCerrado).toHaveBeenCalledWith(
      expect.objectContaining({
        idEleccion: 1,
        actorId: 'admin-1',
        modo: 'MANUAL',
      }),
    );
    expect(eleccionGateway.emitEleccionCerrada).toHaveBeenCalledWith(1);
    expect(result).toMatchObject({
      idEleccion: 1,
      estado: EleccionEstado.CERRADA,
      modo: 'MANUAL',
      snapshotCongelado: true,
    });
  });

  it('rechaza cierre si no está ABIERTA', async () => {
    eleccionRepository.findOne.mockResolvedValue({
      ...mockEleccion,
      estado: EleccionEstado.CONFIGURADA,
    });

    await expect(service.cerrarManual(1, 'admin-1')).rejects.toThrow(
      UnprocessableEntityException,
    );
  });

  it('rechaza cierre si la elección no existe', async () => {
    eleccionRepository.findOne.mockResolvedValue(null);

    await expect(service.cerrarAutomatico(99)).rejects.toThrow(
      NotFoundException,
    );
  });
});
