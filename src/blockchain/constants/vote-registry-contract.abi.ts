/**
 * Minimal VoteRegistry ABI for VoteCast timeline queries (VOTAR-346 / VOTAR-365)
 * and VoteUpdated audit queries (VOTAR-326 — política LAST_WINS).
 */
export const VOTE_REGISTRY_CONTRACT_ABI = [
  {
    type: 'event',
    name: 'VoteCast',
    inputs: [
      { name: 'electionId', type: 'uint256', indexed: true },
      { name: 'voterHash', type: 'bytes32', indexed: true },
      { name: 'candidateId', type: 'uint256', indexed: false },
      { name: 'isOverwrite', type: 'bool', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'VoteUpdated',
    inputs: [
      { name: 'electionId', type: 'uint256', indexed: true },
      { name: 'voterNullifier', type: 'bytes32', indexed: true },
      { name: 'oldCandidate', type: 'uint256', indexed: false },
      { name: 'newCandidate', type: 'uint256', indexed: false },
    ],
  },
] as const;
