import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  AUDIT_GENESIS_HASH,
  AuditLoggerService,
} from '@/audit/audit-logger.service';
import { AuditLog } from '@/audit/entities/audit-log.entity';
import { TipoEventoAudit } from '@/audit/enums/tipo-evento-audit.enum';

describe('AuditLoggerService', () => {
  let service: AuditLoggerService;
  const stored: AuditLog[] = [];
  let nextId = 1;

  const createMock = jest.fn((data: Partial<AuditLog>) => data as AuditLog);
  const saveMock = jest.fn(async (data: Partial<AuditLog>) => {
    const entry = {
      ...data,
      idLog: nextId++,
    } as AuditLog;
    stored.push(entry);
    return entry;
  });
  const findMock = jest.fn(async () => {
    if (stored.length === 0) {
      return [];
    }
    return [stored[stored.length - 1]];
  });

  const repoMock = {
    create: createMock,
    save: saveMock,
    find: findMock,
    manager: {
      transaction: jest.fn(
        async (cb: (manager: { getRepository: () => typeof repoMock }) => Promise<AuditLog>) =>
          cb({ getRepository: () => repoMock }),
      ),
    },
  };

  beforeEach(async () => {
    stored.length = 0;
    nextId = 1;
    createMock.mockClear();
    saveMock.mockClear();
    findMock.mockClear();
    repoMock.manager.transaction.mockClear();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditLoggerService,
        {
          provide: getRepositoryToken(AuditLog),
          useValue: repoMock,
        },
      ],
    }).compile();

    service = module.get(AuditLoggerService);
  });

  it('persists ACCESO_DENEGADO with ofuscated actor and terminal (no plain IP)', async () => {
    const inputTimestamp = new Date('2026-06-24T12:00:00Z');
    const plainIp = '192.168.1.10';

    await service.logAccesoDenegado({
      actorId: '15079',
      ipOrigen: plainIp,
      endpoint: 'GET /elecciones',
      timestamp: inputTimestamp,
      datosAdicionales: { role: 'voter' },
    });

    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tipoEvento: TipoEventoAudit.ACCESO_DENEGADO,
        actor: service.ofuscarOperador('15079'),
        ipOrigen: service.identificadorTerminal(plainIp),
        endpoint: 'GET /elecciones',
        idEleccion: null,
        hashAnterior: AUDIT_GENESIS_HASH,
      }),
    );
    expect(createMock.mock.calls[0][0].ipOrigen).not.toBe(plainIp);
    expect(createMock.mock.calls[0][0].actor).not.toBe('15079');
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

  it('VOTAR-370: encadena hash_anterior al hash_registro previo', async () => {
    const first = await service.logLogin({
      actorId: '14988',
      ipOrigen: '10.0.0.1',
      timestamp: new Date('2026-07-14T10:00:00Z'),
    });
    const second = await service.logComicioAbierto({
      idEleccion: 5,
      actorId: '14988',
      modo: 'MANUAL',
      timestamp: new Date('2026-07-14T10:05:00Z'),
      ipOrigen: '10.0.0.1',
    });

    expect(first.hashAnterior).toBe(AUDIT_GENESIS_HASH);
    expect(first.hashRegistro).toMatch(/^[0-9a-f]{64}$/);
    expect(second.hashAnterior).toBe(first.hashRegistro);
    expect(second.hashRegistro).not.toBe(first.hashRegistro);
  });

  it('VOTAR-370 UAT-01: descripción de apertura con ID ofuscado y terminal criptográfico', async () => {
    const entry = await service.logComicioAbierto({
      idEleccion: 42,
      actorId: '14988',
      modo: 'MANUAL',
      timestamp: new Date('2026-07-14T15:00:00.000Z'),
      ipOrigen: '203.0.113.50',
    });

    const actorOfuscado = service.ofuscarOperador('14988');
    const terminal = service.identificadorTerminal('203.0.113.50');
    expect(entry.descripcion).toContain(
      `Usuario Administrador con ID Ofuscado ${actorOfuscado}`,
    );
    expect(entry.descripcion).toContain('apertura del comicio 42');
    expect(entry.descripcion).toContain(
      `identificador de terminal criptográfico ${terminal}`,
    );
    expect(entry.descripcion).toContain('2026-07-14T15:00:00.000Z');
    expect(entry.descripcion).not.toContain('203.0.113.50');
    expect(entry.actor).toBe(actorOfuscado);
    expect(entry.ipOrigen).toBe(terminal);
  });

  it('VOTAR-370 UAT-02: PADRON_CARGADO enriquecido con archivo, filas, duplicados y Merkle', async () => {
    const entry = await service.logPadronCargado({
      idEleccion: 7,
      actorId: '14988',
      nombreArchivo: 'padron-oficial.csv',
      totalProcesados: 105,
      totalImportados: 100,
      duplicadosExcluidos: 2,
      merkleRoot: 'abc123merkle',
      ipOrigen: '10.1.2.3',
    });

    expect(entry.tipoEvento).toBe(TipoEventoAudit.PADRON_CARGADO);
    expect(entry.datosAdicionales).toMatchObject({
      resultado: 'EXITOSO',
      nombreArchivo: 'padron-oficial.csv',
      totalProcesados: 105,
      totalImportados: 100,
      duplicadosExcluidos: 2,
      merkleRoot: 'abc123merkle',
    });
    expect(entry.descripcion).toContain('padron-oficial.csv');
    expect(entry.descripcion).toContain('100 filas netas');
    expect(entry.descripcion).toContain('2 duplicados excluidos');
    expect(entry.descripcion).toContain('abc123merkle');
  });

  it('VOTAR-370 UAT-03: fallo de integridad mantiene continuidad de la cadena', async () => {
    const login = await service.logLogin({
      actorId: '14988',
      ipOrigen: '10.0.0.1',
    });
    const fallo = await service.logPadronCargaFallida({
      idEleccion: 9,
      actorId: '14988',
      nombreArchivo: 'corrupto.csv',
      razon: 'El archivo no tiene las columnas requeridas: dni, email.',
      ipOrigen: '10.0.0.1',
    });

    expect(fallo.hashAnterior).toBe(login.hashRegistro);
    expect(fallo.datosAdicionales).toMatchObject({
      resultado: 'RECHAZADO',
      nivel: 'ERROR',
      nombreArchivo: 'corrupto.csv',
    });
    expect(fallo.descripcion).toMatch(/Advertencia\/Error|fallo de integridad/i);
    expect(fallo.descripcion).toContain('corrupto.csv');
  });
});
