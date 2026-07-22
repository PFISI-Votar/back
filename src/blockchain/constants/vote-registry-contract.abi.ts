/**
 * Minimal VoteRegistry ABI for VoteCast timeline queries (VOTAR-346 / VOTAR-365).
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
] as const;
