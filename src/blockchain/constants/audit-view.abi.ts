/** Minimal ABI for AuditViewContract public reads (VOTAR-350). */
export const AUDIT_VIEW_ABI = [
  'function getParticipationStats(uint256 electionId) view returns (uint256 totalVotes, uint256 blankVotes, uint256 nullVotes)',
  'function getVotesByCandidate(uint256 electionId, uint256 candidateId) view returns (uint256)',
] as const;

/** Reserved on-chain ids from VoteRegistry (blanco / nulo). */
export const VOTO_BLANCO_ID = (2n ** 256n - 2n).toString();
export const VOTO_NULO_ID = (2n ** 256n - 1n).toString();
