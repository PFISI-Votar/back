/** VoteRegistry.SIN_VOTO_PREVIO = type(uint256).max - 2 (Solidity). */
export const SIN_VOTO_PREVIO = 2n ** 256n - 3n;

export const toCandidateId = (value: unknown): bigint | null => {
  if (typeof value === 'bigint') {
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return BigInt(Math.trunc(value));
  }
  if (typeof value === 'string' && /^\d+$/.test(value)) {
    return BigInt(value);
  }
  return null;
};

/** Privacy-safe audit copy for VoteCast (no candidate id on public dashboard). */
export const describeVoteCastAudit = (): string => 'Sufragio contabilizado';

/**
 * VoteUpdated is emitted on every vote; only real overwrites are labeled re-voto.
 * First vote uses SIN_VOTO_PREVIO sentinel — must not be shown as re-voto.
 */
export const describeVoteUpdatedAudit = (
  args: ReadonlyArray<unknown> & Record<string, unknown>,
): string | null => {
  const oldCandidate = toCandidateId(args.oldCandidate ?? args[2]);
  if (oldCandidate === null || oldCandidate === SIN_VOTO_PREVIO) {
    return null;
  }
  return 'Re-voto registrado';
};

const normalizeAuditDescriptionPart = (part: string): string | null => {
  if (/^Sufragio contabilizado\b/.test(part)) {
    return 'Sufragio contabilizado';
  }
  if (/^Re-voto registrado\b/.test(part)) {
    // Legacy rows: sentinel oldCandidate rendered via Number() as scientific notation.
    if (/e\+/i.test(part)) {
      return null;
    }
    return 'Re-voto registrado';
  }
  return part;
};

/** Normalizes legacy indexed descriptions already stored in PostgreSQL. */
export const normalizeDescripcionLegible = (combined: string): string => {
  const parts = combined
    .split(' · ')
    .map((part) => normalizeAuditDescriptionPart(part.trim()))
    .filter((part): part is string => part !== null && part.length > 0);
  return [...new Set(parts)].join(' · ');
};

export const joinAuditDescriptions = (
  descriptions: Array<string | null | undefined>,
): string =>
  [
    ...new Set(
      descriptions.filter(
        (description): description is string =>
          typeof description === 'string' && description.length > 0,
      ),
    ),
  ].join(' · ');
