import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RefreshSession } from '@/auth/entities/refresh-session.entity';
import { RevocacionMotivo } from '@/auth/enums/revocacion-motivo.enum';
import { RefreshTokenService } from '@/auth/services/refresh-token.service';

type RepoMock = jest.Mocked<
  Pick<
    Repository<RefreshSession>,
    'create' | 'save' | 'findOne' | 'find' | 'update' | 'createQueryBuilder'
  >
>;

const CONFIG: Record<string, string> = {
  JWT_REFRESH_EXPIRES_IN: '8h',
  SESSION_IDLE_TIMEOUT: '30m',
  SESSION_ACTIVITY_WRITE_INTERVAL: '60s',
};

const buildSession = (
  overrides: Partial<RefreshSession> = {},
): RefreshSession => ({
  idSession: 1,
  tokenHash: 'hash',
  identificadorSso: '14988',
  sub: '14988',
  email: 'admin@test.local',
  nombre: 'Admin',
  expiresAt: new Date(Date.now() + 3_600_000),
  lastActivityAt: new Date(),
  revokedAt: null,
  revokedReason: null,
  createdAt: new Date(),
  ...overrides,
});

describe('RefreshTokenService', () => {
  let service: RefreshTokenService;
  let repository: RepoMock;
  let updateExecute: jest.Mock;

  beforeEach(async () => {
    updateExecute = jest.fn().mockResolvedValue({ affected: 2 });
    repository = {
      create: jest.fn((data) => data as RefreshSession),
      save: jest.fn((entity) => Promise.resolve(entity as RefreshSession)),
      findOne: jest.fn(),
      find: jest.fn(),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      createQueryBuilder: jest.fn(() => {
        const qb: Record<string, unknown> = {};
        for (const method of ['update', 'set', 'where', 'andWhere']) {
          qb[method] = jest.fn(() => qb);
        }
        qb.execute = updateExecute;
        return qb;
      }),
    } as unknown as RepoMock;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RefreshTokenService,
        {
          provide: ConfigService,
          useValue: { get: jest.fn((key: string) => CONFIG[key]) },
        },
        { provide: getRepositoryToken(RefreshSession), useValue: repository },
      ],
    }).compile();

    service = module.get(RefreshTokenService);
  });

  it('issues a session and returns its id for the sid claim', async () => {
    repository.save.mockResolvedValueOnce(buildSession({ idSession: 7 }));

    const issued = await service.issueSession({
      identificadorSso: '14988',
      sub: '14988',
    });

    expect(issued.refreshToken).toBeDefined();
    expect(issued.idSession).toBe(7);
  });

  it('rotates the token hash in-place preserving idSession and expiresAt', async () => {
    const expiresAt = new Date(Date.now() + 7_200_000);
    const activeSession = buildSession({ idSession: 5, expiresAt });
    repository.findOne.mockResolvedValueOnce(activeSession);

    const issued = { refreshToken: 'seed' };
    const rotated = await service.rotateSession(issued.refreshToken);

    expect(rotated.idSession).toBe(5);
    expect(rotated.refreshToken).not.toBe(issued.refreshToken);
    expect(activeSession.expiresAt).toBe(expiresAt);
    expect(activeSession.revokedAt).toBeNull();
  });

  it('rotateSession rejects an idle session and marks it INACTIVIDAD', async () => {
    const idleSession = buildSession({
      lastActivityAt: new Date(Date.now() - 31 * 60_000),
    });
    repository.findOne.mockResolvedValueOnce(idleSession);

    await expect(service.rotateSession('token')).rejects.toThrow(
      UnauthorizedException,
    );
    expect(repository.update).toHaveBeenCalledWith(
      idleSession.idSession,
      expect.objectContaining({ revokedReason: RevocacionMotivo.INACTIVIDAD }),
    );
  });

  it('revokeSession is idempotent for an already-revoked session', async () => {
    repository.findOne.mockResolvedValueOnce(
      buildSession({ revokedAt: new Date() }),
    );

    await expect(service.revokeSession('token')).resolves.toBe(false);
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('revokeSession returns false for an unknown token', async () => {
    repository.findOne.mockResolvedValueOnce(null);
    await expect(service.revokeSession('token')).resolves.toBe(false);
  });

  it('revokeSession revokes an active session with the given reason', async () => {
    const session = buildSession();
    repository.findOne.mockResolvedValueOnce(session);

    await expect(
      service.revokeSession('token', RevocacionMotivo.REVOCACION_ADMIN),
    ).resolves.toBe(true);
    expect(session.revokedReason).toBe(RevocacionMotivo.REVOCACION_ADMIN);
    expect(session.revokedAt).toBeInstanceOf(Date);
  });

  describe('validateActiveSession', () => {
    it('rejects a revoked session', async () => {
      repository.findOne.mockResolvedValueOnce(
        buildSession({ revokedAt: new Date() }),
      );
      await expect(service.validateActiveSession(1)).rejects.toThrow(
        'session_revoked',
      );
    });

    it('caduca por inactividad y marca INACTIVIDAD', async () => {
      repository.findOne.mockResolvedValueOnce(
        buildSession({ lastActivityAt: new Date(Date.now() - 31 * 60_000) }),
      );
      await expect(service.validateActiveSession(1)).rejects.toThrow(
        'session_idle',
      );
      expect(repository.update).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          revokedReason: RevocacionMotivo.INACTIVIDAD,
        }),
      );
    });

    it('no escribe last_activity_at dentro del intervalo de throttle', async () => {
      repository.findOne.mockResolvedValueOnce(
        buildSession({ lastActivityAt: new Date(Date.now() - 10_000) }),
      );
      await service.validateActiveSession(1);
      expect(repository.update).not.toHaveBeenCalled();
    });

    it('escribe last_activity_at pasado el intervalo de throttle', async () => {
      repository.findOne.mockResolvedValueOnce(
        buildSession({ lastActivityAt: new Date(Date.now() - 120_000) }),
      );
      await service.validateActiveSession(1);
      expect(repository.update).toHaveBeenCalledWith(
        1,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        expect.objectContaining({ lastActivityAt: expect.any(Date) }),
      );
    });
  });

  it('revokeSessionsByUser devuelve las filas afectadas y respeta exceptIdSession', async () => {
    const affected = await service.revokeSessionsByUser({
      identificadorSso: '14988',
      motivo: RevocacionMotivo.REVOCACION_ADMIN,
      exceptIdSession: 9,
    });
    expect(affected).toBe(2);
    expect(updateExecute).toHaveBeenCalled();
  });

  it('revokeAllSessions devuelve las filas afectadas', async () => {
    updateExecute.mockResolvedValueOnce({ affected: 5 });
    const affected = await service.revokeAllSessions(
      RevocacionMotivo.REVOCACION_GLOBAL,
    );
    expect(affected).toBe(5);
  });
});
