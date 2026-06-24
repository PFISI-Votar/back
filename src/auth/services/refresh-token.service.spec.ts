import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RefreshSession } from '@/auth/entities/refresh-session.entity';
import { RefreshTokenService } from '@/auth/services/refresh-token.service';

describe('RefreshTokenService', () => {
  let service: RefreshTokenService;
  let repository: jest.Mocked<
    Pick<Repository<RefreshSession>, 'create' | 'save' | 'findOne'>
  >;

  beforeEach(async () => {
    repository = {
      create: jest.fn((data) => data as RefreshSession),
      save: jest.fn(async (entity) => entity as RefreshSession),
      findOne: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RefreshTokenService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) =>
              key === 'JWT_REFRESH_EXPIRES_IN' ? '8h' : undefined,
            ),
          },
        },
        {
          provide: getRepositoryToken(RefreshSession),
          useValue: repository,
        },
      ],
    }).compile();

    service = module.get(RefreshTokenService);
  });

  it('issues and rotates refresh sessions', async () => {
    const issued = await service.issueSession({
      identificadorSso: '14988',
      sub: '14988',
      email: 'admin@test.local',
      name: 'Admin',
    });

    expect(issued.refreshToken).toBeDefined();
    expect(repository.save).toHaveBeenCalled();

    const activeSession = {
      idSession: 1,
      identificadorSso: '14988',
      sub: '14988',
      email: 'admin@test.local',
      nombre: 'Admin',
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
    } as RefreshSession;

    repository.findOne.mockResolvedValueOnce(activeSession);

    const rotated = await service.rotateSession(issued.refreshToken);

    expect(rotated.identity.identificadorSso).toBe('14988');
    expect(rotated.refreshToken).not.toBe(issued.refreshToken);
    expect(activeSession.revokedAt).toBeInstanceOf(Date);
  });

  it('rejects expired refresh sessions', async () => {
    const issued = await service.issueSession({
      identificadorSso: '15079',
      sub: '15079',
    });

    const expiredSession = {
      idSession: 2,
      identificadorSso: '15079',
      sub: '15079',
      email: null,
      nombre: null,
      expiresAt: new Date(Date.now() - 60_000),
      revokedAt: null,
    } as RefreshSession;

    repository.findOne.mockResolvedValue(expiredSession);

    await expect(service.rotateSession(issued.refreshToken)).rejects.toThrow(
      UnauthorizedException,
    );
  });
});
