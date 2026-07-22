import { UnprocessableEntityException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Brackets, Repository, SelectQueryBuilder } from 'typeorm';
import { AuditLoggerService } from '@/audit/audit-logger.service';
import { AuditLogSearchQueryDto } from '@/audit/dto/audit-log-search-query.dto';
import { AuditLog } from '@/audit/entities/audit-log.entity';
import { TipoEventoAudit } from '@/audit/enums/tipo-evento-audit.enum';
import { AuditLogQueryService } from '@/audit/services/audit-log-query.service';

describe('AuditLogQueryService', () => {
  let service: AuditLogQueryService;
  let qb: jest.Mocked<SelectQueryBuilder<AuditLog>>;
  let auditLoggerService: jest.Mocked<
    Pick<AuditLoggerService, 'ofuscarOperador' | 'identificadorTerminal'>
  >;

  const mockRow: AuditLog = {
    idLog: 1,
    idEleccion: 3,
    tipoEvento: TipoEventoAudit.LOGIN,
    timestamp: new Date('2026-07-22T12:00:00.000Z'),
    actor: 'abc123hash',
    descripcion: 'Login test',
    hashRegistro: 'hash1',
    hashAnterior: 'hash0',
    ipOrigen: 'terminalhash',
    endpoint: 'POST /auth/login',
    datosAdicionales: { nivel: 'INFO' },
  };

  beforeEach(async () => {
    qb = {
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[mockRow], 1]),
    } as unknown as jest.Mocked<SelectQueryBuilder<AuditLog>>;

    const mockRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(qb),
    } as unknown as Repository<AuditLog>;

    auditLoggerService = {
      ofuscarOperador: jest.fn().mockReturnValue('hashed-actor'),
      identificadorTerminal: jest.fn().mockReturnValue('hashed-terminal'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditLogQueryService,
        {
          provide: getRepositoryToken(AuditLog),
          useValue: mockRepository,
        },
        {
          provide: AuditLoggerService,
          useValue: auditLoggerService,
        },
      ],
    }).compile();

    service = module.get(AuditLogQueryService);
  });

  it('returns paginated results ordered DESC', async () => {
    const query = new AuditLogSearchQueryDto();
    query.page = 1;
    query.limit = 50;

    const actual = await service.consultarAuditLog(query);

    expect(qb.orderBy.mock.calls).toContainEqual(['log.timestamp', 'DESC']);
    expect(qb.addOrderBy.mock.calls).toContainEqual(['log.idLog', 'DESC']);
    expect(qb.skip.mock.calls).toContainEqual([0]);
    expect(qb.take.mock.calls).toContainEqual([50]);
    expect(actual.total).toBe(1);
    expect(actual.items[0].identificadorTerminal).toBe('terminalhash');
    expect(actual.items[0].actor).toBe('abc123hash');
  });

  it('filters by actor hash directly when input is SHA-256 hex', async () => {
    const hash = 'a'.repeat(64);
    const query = new AuditLogSearchQueryDto();
    query.actor = hash;

    await service.consultarAuditLog(query);

    expect(auditLoggerService.ofuscarOperador).not.toHaveBeenCalled();
    expect(qb.andWhere.mock.calls).toContainEqual([
      'log.actor = :actor',
      { actor: hash },
    ]);
  });

  it('hashes raw actor before filtering', async () => {
    const query = new AuditLogSearchQueryDto();
    query.actor = '14988';

    await service.consultarAuditLog(query);

    expect(auditLoggerService.ofuscarOperador).toHaveBeenCalledWith('14988');
    expect(qb.andWhere.mock.calls).toContainEqual([
      'log.actor = :actor',
      { actor: 'hashed-actor' },
    ]);
  });

  it('filters by multiple tipoEvento values', async () => {
    const query = new AuditLogSearchQueryDto();
    query.tipoEvento = [TipoEventoAudit.LOGIN, TipoEventoAudit.ACCESO_DENEGADO];

    await service.consultarAuditLog(query);

    expect(qb.andWhere.mock.calls).toContainEqual([
      'log.tipoEvento IN (:...tipoEvento)',
      {
        tipoEvento: query.tipoEvento,
      },
    ]);
  });

  it('filters by idEleccion', async () => {
    const query = new AuditLogSearchQueryDto();
    query.idEleccion = 7;

    await service.consultarAuditLog(query);

    expect(qb.andWhere.mock.calls).toContainEqual([
      'log.idEleccion = :idEleccion',
      { idEleccion: 7 },
    ]);
  });

  it('filters by date range', async () => {
    const query = new AuditLogSearchQueryDto();
    query.desde = '2026-07-21T12:00:00.000Z';
    query.hasta = '2026-07-21T14:00:00.000Z';

    await service.consultarAuditLog(query);

    expect(qb.andWhere.mock.calls).toContainEqual([
      'log.timestamp >= :desde',
      { desde: query.desde },
    ]);
    expect(qb.andWhere.mock.calls).toContainEqual([
      'log.timestamp <= :hasta',
      { hasta: query.hasta },
    ]);
  });

  it('throws 422 when desde is after hasta', async () => {
    const query = new AuditLogSearchQueryDto();
    query.desde = '2026-07-22T14:00:00.000Z';
    query.hasta = '2026-07-22T12:00:00.000Z';

    await expect(service.consultarAuditLog(query)).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });

  it('hashes raw terminal IP before filtering', async () => {
    const query = new AuditLogSearchQueryDto();
    query.terminal = '192.168.1.10';

    await service.consultarAuditLog(query);

    expect(auditLoggerService.identificadorTerminal).toHaveBeenCalledWith(
      '192.168.1.10',
    );
    expect(qb.andWhere.mock.calls).toContainEqual([
      'log.ipOrigen = :terminal',
      { terminal: 'hashed-terminal' },
    ]);
  });

  it('filters by terminal hash directly when input is SHA-256 hex', async () => {
    const hash = 'b'.repeat(64);
    const query = new AuditLogSearchQueryDto();
    query.terminal = hash;

    await service.consultarAuditLog(query);

    expect(auditLoggerService.identificadorTerminal).not.toHaveBeenCalled();
    expect(qb.andWhere.mock.calls).toContainEqual([
      'log.ipOrigen = :terminal',
      { terminal: hash },
    ]);
  });

  it('applies free-text filter on descripcion', async () => {
    const query = new AuditLogSearchQueryDto();
    query.q = 'padrón';

    await service.consultarAuditLog(query);

    expect(
      qb.andWhere.mock.calls.some(([arg]) => arg instanceof Brackets),
    ).toBe(true);
  });
});
