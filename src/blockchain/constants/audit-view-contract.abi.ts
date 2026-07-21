/**
 * Minimal AuditViewContract ABI for VOTAR-350 / VOTAR-365 public participation reads.
 */
export const AUDIT_VIEW_CONTRACT_ABI = [
  {
    type: 'function',
    name: 'getParticipationStats',
    stateMutability: 'view',
    inputs: [{ name: 'electionId', type: 'uint256' }],
    outputs: [
      { name: 'totalVotes', type: 'uint256' },
      { name: 'blankVotes', type: 'uint256' },
      { name: 'nullVotes', type: 'uint256' },
    ],
  },
  {
    type: 'function',
    name: 'getVotesByCandidate',
    stateMutability: 'view',
    inputs: [
      { name: 'electionId', type: 'uint256' },
      { name: 'candidateId', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;
