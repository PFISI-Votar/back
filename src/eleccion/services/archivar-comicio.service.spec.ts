/* eslint-disable @typescript-eslint/unbound-method */
import { Test, TestingModule } from '@nestjs/testing';
import { ArchivarComicioService } from './archivar-comicio.service';
import { Eleccion } from '@/eleccion/entities/eleccion.entity';
import { EleccionEstado } from '@/eleccion/enums/eleccion-estado.enum';
import { ElectionStateService } from '@/eleccion/services/election-state.service';
import { AuditLoggerService } from '@/audit/audit-logger.service';

jest.mock('@/eleccion/gateways/eleccion.gateway', () => ({
  EleccionGateway: class EleccionGateway {
    emitEleccionArchivada = jest.fn();
  },
}));

import { EleccionGateway } from '@/eleccion/gateways/eleccion.gateway';

describe('ArchivarComicioService', () => {
  let service: ArchivarComicioService;
  let electionStateService: jest.Mocked<ElectionStateService>;
  let auditLoggerService: jest.Mocked<AuditLoggerService>;
  let eleccionGateway: jest.Mocked<EleccionGateway>;

  const mockEleccion: Eleccion = {
    idEleccion: 1,
    nombre: 'Test Election',
    descripcion: 'Test Description',
    estado: EleccionEstado.ARCHIVADA,
    fechaInicio: new Date('2026-01-01T10:00:00Z'),
    fechaFin: new Date('2026-01-01T18:00:00Z'),
    tipoVotacion: 'UNICA_LISTA',
    fechaCreacion: new Date(),
    fechaActualizacion: new Date(),
  } as Eleccion;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ArchivarComicioService,
        {
          provide: ElectionStateService,
          useValue: { transitionToArchivada: jest.fn() },
        },
        {
          provide: AuditLoggerService,
          useValue: { logComicioArchivado: jest.fn() },
        },
        {
          provide: EleccionGateway,
          useValue: { emitEleccionArchivada: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<ArchivarComicioService>(ArchivarComicioService);
    electionStateService = module.get(ElectionStateService);
    auditLoggerService = module.get(AuditLoggerService);
    eleccionGateway = module.get(EleccionGateway);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('archivarManual', () => {
    it('should transition, audit and emit websocket event', async () => {
      electionStateService.transitionToArchivada.mockResolvedValue(
        mockEleccion,
      );

      const result = await service.archivarManual(1, 'actor-1', '10.0.0.1');

      expect(electionStateService.transitionToArchivada).toHaveBeenCalledWith(
        1,
      );
      expect(auditLoggerService.logComicioArchivado).toHaveBeenCalledWith(
        expect.objectContaining({
          idEleccion: 1,
          actorId: 'actor-1',
          ipOrigen: '10.0.0.1',
        }),
      );
      expect(eleccionGateway.emitEleccionArchivada).toHaveBeenCalledWith(1);
      expect(result).toEqual(mockEleccion);
    });

    it('should propagate errors from transitionToArchivada without auditing', async () => {
      electionStateService.transitionToArchivada.mockRejectedValue(
        new Error('estado inválido'),
      );

      await expect(service.archivarManual(1, 'actor-1')).rejects.toThrow(
        'estado inválido',
      );

      expect(auditLoggerService.logComicioArchivado).not.toHaveBeenCalled();
      expect(eleccionGateway.emitEleccionArchivada).not.toHaveBeenCalled();
    });
  });
});
