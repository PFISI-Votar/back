import {
  describeVoteCastAudit,
  describeVoteUpdatedAudit,
  normalizeDescripcionLegible,
  SIN_VOTO_PREVIO,
} from '@/blockchain/utils/audit-transaction-description.util';

describe('audit-transaction-description.util', () => {
  it('describeVoteCastAudit omits candidate id', () => {
    expect(describeVoteCastAudit()).toBe('Sufragio contabilizado');
  });

  it('describeVoteUpdatedAudit skips first vote sentinel', () => {
    expect(
      describeVoteUpdatedAudit({
        0: 1n,
        1: '0x' + 'aa'.repeat(32),
        2: SIN_VOTO_PREVIO,
        3: 7n,
        oldCandidate: SIN_VOTO_PREVIO,
        newCandidate: 7n,
      }),
    ).toBeNull();
  });

  it('describeVoteUpdatedAudit labels real overwrite', () => {
    expect(
      describeVoteUpdatedAudit({
        oldCandidate: 3n,
        newCandidate: 7n,
      }),
    ).toBe('Re-voto registrado');
  });

  it('normalizeDescripcionLegible fixes legacy vote rows', () => {
    expect(
      normalizeDescripcionLegible(
        'Sufragio firmado registrado en la urna digital · Sufragio contabilizado (candidato #7) · Re-voto registrado (candidato #1.157920892373162e+77 → #7)',
      ),
    ).toBe(
      'Sufragio firmado registrado en la urna digital · Sufragio contabilizado',
    );
  });

  it('normalizeDescripcionLegible keeps real re-voto without candidate ids', () => {
    expect(
      normalizeDescripcionLegible(
        'Sufragio contabilizado (candidato #3, re-voto) · Re-voto registrado (candidato #3 → #7)',
      ),
    ).toBe('Sufragio contabilizado · Re-voto registrado');
  });
});
