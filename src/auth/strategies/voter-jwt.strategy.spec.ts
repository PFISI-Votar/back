import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtRole } from '@/auth/enums/jwt-role.enum';
import { VoterJwtPayload } from '@/auth/interfaces/voter-jwt-payload.interface';
import {
  assertVoterAuthenticatedUser,
  VoterJwtStrategy,
} from '@/auth/strategies/voter-jwt.strategy';

describe('VoterJwtStrategy', () => {
  let strategy: VoterJwtStrategy;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VoterJwtStrategy,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) =>
              key === 'JWT_SECRET'
                ? 'test-secret-for-e2e-tests-min-16'
                : undefined,
            ),
          },
        },
      ],
    }).compile();

    strategy = module.get(VoterJwtStrategy);
  });

  it('validates payload with role voter and required claims', () => {
    const payload: VoterJwtPayload = {
      sub: '14988',
      role: JwtRole.VOTER,
      votanteHash: 'a'.repeat(64),
      idEleccion: 2,
    };

    const actual = strategy.validate(payload);

    expect(actual).toEqual(payload);
  });

  it('rejects payload without voter role', () => {
    expect(() =>
      strategy.validate({
        sub: '14988',
        role: JwtRole.ELECTION_ADMIN,
        votanteHash: 'a'.repeat(64),
        idEleccion: 2,
      } as never),
    ).toThrow(UnauthorizedException);
  });

  it('assertVoterAuthenticatedUser throws when user is missing', () => {
    expect(() => assertVoterAuthenticatedUser(undefined)).toThrow(
      UnauthorizedException,
    );
  });
});
