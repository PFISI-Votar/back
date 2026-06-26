import { ForbiddenException } from '@nestjs/common';
import { ExecutionContext } from '@nestjs/common/interfaces';
import { VoterElectionGuard } from '@/auth/guards/voter-election.guard';
import { JwtRole } from '@/auth/enums/jwt-role.enum';

describe('VoterElectionGuard', () => {
  const guard = new VoterElectionGuard();

  const buildContext = (params: Record<string, string>, user?: object) =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({
          params,
          user,
        }),
      }),
    }) as ExecutionContext;

  it('allows access when JWT idEleccion matches route', () => {
    const actual = guard.canActivate(
      buildContext(
        { idEleccion: '7' },
        {
          sub: '14988',
          role: JwtRole.VOTER,
          votanteHash: 'a'.repeat(64),
          idEleccion: 7,
        },
      ),
    );
    expect(actual).toBe(true);
  });

  it('denies access when idEleccion does not match', () => {
    expect(() =>
      guard.canActivate(
        buildContext(
          { idEleccion: '7' },
          {
            sub: '14988',
            role: JwtRole.VOTER,
            votanteHash: 'a'.repeat(64),
            idEleccion: 3,
          },
        ),
      ),
    ).toThrow(ForbiddenException);
  });
});
