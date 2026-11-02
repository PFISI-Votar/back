import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtRole } from '@/auth/enums/jwt-role.enum';
import { JwtPayload } from '@/auth/interfaces/jwt-payload.interface';
import { JwksService } from '@/auth/services/jwks.service';
import { RefreshTokenService } from '@/auth/services/refresh-token.service';
import { JwtStrategy } from '@/auth/strategies/jwt.strategy';

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;
  const validateActiveSession = jest.fn();

  beforeEach(async () => {
    validateActiveSession.mockReset().mockResolvedValue({});
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JwtStrategy,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'JWT_ISSUER') return 'https://votar.local/idp';
              if (key === 'JWT_AUDIENCE') return 'votar-api';
              return undefined;
            }),
          },
        },
        { provide: JwksService, useValue: { getVerificationKey: jest.fn() } },
        { provide: RefreshTokenService, useValue: { validateActiveSession } },
      ],
    }).compile();

    strategy = module.get(JwtStrategy);
  });

  it('rejects a token without a sid claim', async () => {
    await expect(
      strategy.validate({
        sub: '14988',
        role: JwtRole.ELECTION_ADMIN,
      }),
    ).rejects.toThrow(UnauthorizedException);
    expect(validateActiveSession).not.toHaveBeenCalled();
  });

  it('rejects a 2fa challenge token without touching the session store', async () => {
    await expect(
      strategy.validate({
        sub: '14988',
        role: JwtRole.ELECTION_ADMIN,
        sid: 1,
        purpose: '2fa_challenge',
      }),
    ).rejects.toThrow(UnauthorizedException);
    expect(validateActiveSession).not.toHaveBeenCalled();
  });

  it('validates the active session for a token carrying sid', async () => {
    const payload: JwtPayload = {
      sub: '14988',
      role: JwtRole.ELECTION_ADMIN,
      sid: 42,
    };

    const actual = await strategy.validate(payload);

    expect(actual).toEqual(payload);
    expect(validateActiveSession).toHaveBeenCalledTimes(1);
    expect(validateActiveSession).toHaveBeenCalledWith(42);
  });

  it('propagates a revoked/idle session rejection', async () => {
    validateActiveSession.mockRejectedValueOnce(
      new UnauthorizedException('session_revoked'),
    );
    await expect(
      strategy.validate({
        sub: '14988',
        role: JwtRole.ELECTION_ADMIN,
        sid: 42,
      }),
    ).rejects.toThrow('session_revoked');
  });
});
