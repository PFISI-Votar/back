import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AuditLoggerService } from '@/audit/audit-logger.service';
import { AuditLog } from '@/audit/entities/audit-log.entity';
import { TipoEventoAudit } from '@/audit/enums/tipo-evento-audit.enum';

describe('AuditLoggerService', () => {
  let service: AuditLoggerService;
  const createMock = jest.fn((data: Partial<AuditLog>) => data as AuditLog);
  const saveMock = jest.fn((data: Partial<AuditLog>) =>
    Promise.resolve(data as AuditLog),
  );

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

  it('UAT-05: VOTO_EMITIDO no persiste IP, actor SSO ni datos joinables', async () => {
    const actual = await service.logVotoEmitido({
      idEleccion: 7,
      timestamp: new Date('2026-07-11T12:00:00Z'),
    });

    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tipoEvento: TipoEventoAudit.VOTO_EMITIDO,
        idEleccion: 7,
        actor: 'ANONIMO',
        ipOrigen: null,
        datosAdicionales: null,
      }),
    );
    expect(actual.ipOrigen).toBeNull();
    expect(actual.actor).toBe('ANONIMO');
    expect(actual.datosAdicionales).toBeNull();
  });

  it('UAT-05: assertVotoAuditIsAnonymous rechaza IP o SessionID en voto', () => {
    expect(() =>
      service.assertVotoAuditIsAnonymous({
        tipoEvento: TipoEventoAudit.VOTO_EMITIDO,
        ipOrigen: '10.0.0.1',
        actor: 'ANONIMO',
      }),
    ).toThrow(/ip_origen/);

    expect(() =>
      service.assertVotoAuditIsAnonymous({
        tipoEvento: TipoEventoAudit.VOTO_EMITIDO,
        ipOrigen: null,
        actor: 'ANONIMO',
        datosAdicionales: { SessionID: 'abc' },
      }),
    ).toThrow(/SessionID/);
  });

  it('UAT-05: muestra mixta no comparte campos joinables voto↔login SSO', async () => {
    const loginLike: Partial<AuditLog> = {
      tipoEvento: TipoEventoAudit.LOGIN,
      actor: 'sso-sub-123',
      ipOrigen: '203.0.113.10',
      endpoint: 'POST /auth/votante/login',
      datosAdicionales: { SessionID: 'sess-votante-1' },
    };
    const voto = await service.logVotoEmitido({ idEleccion: 3 });
    const sample = [loginLike, voto];

    const votoEntries = sample.filter(
      (entry) => entry.tipoEvento === TipoEventoAudit.VOTO_EMITIDO,
    );
    const loginEntries = sample.filter(
      (entry) => entry.tipoEvento === TipoEventoAudit.LOGIN,
    );

    for (const votoEntry of votoEntries) {
      service.assertVotoAuditIsAnonymous(votoEntry);
      for (const loginEntry of loginEntries) {
        expect(votoEntry.ipOrigen).not.toBe(loginEntry.ipOrigen);
        expect(votoEntry.actor).not.toBe(loginEntry.actor);
        const votoExtra = votoEntry.datosAdicionales ?? {};
        const loginExtra = loginEntry.datosAdicionales ?? {};
        const commonKeys = Object.keys(votoExtra).filter((key) =>
          Object.prototype.hasOwnProperty.call(loginExtra, key),
        );
        expect(commonKeys).toHaveLength(0);
      }
    }
  });
});
