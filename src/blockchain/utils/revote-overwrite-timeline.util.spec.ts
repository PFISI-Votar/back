import {
  buildRevoteOverwriteTimelineFromIndexedVotes,
  isIndexedRevote,
  isIndexedVoteTransaction,
} from '@/blockchain/utils/revote-overwrite-timeline.util';

describe('revote-overwrite-timeline.util — VOTAR-329/373', () => {
  it('detects vote and revote rows from indexed audit descriptions', () => {
    expect(
      isIndexedVoteTransaction({
        nombreEvento: 'SignedVoteCast, VoteCast',
        descripcionLegible: 'Sufragio contabilizado (candidato #7)',
      }),
    ).toBe(true);
    expect(
      isIndexedRevote({
        descripcionLegible:
          'Sufragio contabilizado (candidato #7) · Re-voto registrado',
      }),
    ).toBe(true);
  });

  it('builds cumulative overwrite ratio series from indexed vote events', () => {
    const nowMs = Date.now();
    const actual = buildRevoteOverwriteTimelineFromIndexedVotes(
      [
        { timestampMs: nowMs - 90 * 60 * 1000, isRevote: false },
        { timestampMs: nowMs - 60 * 60 * 1000, isRevote: true },
        { timestampMs: nowMs - 30 * 60 * 1000, isRevote: false },
      ],
      2,
    );

    expect(actual).toHaveLength(2);
    expect(actual[1].totalEventos).toBe(3);
    expect(actual[1].totalRevotes).toBe(1);
    expect(actual[1].overwriteRatio).toBeCloseTo(1 / 3, 3);
  });
});
