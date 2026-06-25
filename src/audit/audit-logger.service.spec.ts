import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AuditLoggerService } from '@/audit/audit-logger.service';
import { AuditLog } from '@/audit/entities/audit-log.entity';
import { TipoEventoAudit } from '@/audit/enums/tipo-evento-audit.enum';

describe('AuditLoggerService', () => {
  let service: AuditLoggerService;
  const createMock = jest.fn((data: Partial<AuditLog>) => data as AuditLog);
  const saveMock = jest.fn().mockResolvedValue(undefined);

  beforeEach(async () => {
    createMock.mockClear();
    saveMock.mockClear();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditLoggerService,
        {
          provide: getRepositoryToken(AuditLog),
          useValue: {
            create: createMock,
            save: saveMock,
          },
        },
      ],
    }).compile();

    service = module.get(AuditLoggerService);
  });

  it('persists ACCESO_DENEGADO with required fields', async () => {
    const inputTimestamp = new Date('2026-06-24T12:00:00Z');

    await service.logAccesoDenegado({
      actorId: '15079',
      ipOrigen: '192.168.1.10',
      endpoint: 'GET /elecciones',
      timestamp: inputTimestamp,
      datosAdicionales: { role: 'voter' },
    });

    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tipoEvento: TipoEventoAudit.ACCESO_DENEGADO,
        actor: '15079',
        ipOrigen: '192.168.1.10',
        endpoint: 'GET /elecciones',
        idEleccion: null,
      }),
    );
    expect(saveMock).toHaveBeenCalled();
  });
});
