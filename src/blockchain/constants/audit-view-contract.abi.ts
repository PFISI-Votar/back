/**
 * Minimal AuditViewContract ABI for VOTAR-364 / VOTAR-365 public reads (VOTAR-350).
 * Extended for VOTAR-367 contract audit metadata.
 */
export const AUDIT_VIEW_CONTRACT_ABI = [
  {
    type: 'function',
    name: 'getElectionState',
    stateMutability: 'view',
    inputs: [{ name: 'electionId', type: 'uint256' }],
    outputs: [{ name: '', type: 'uint8' }],
  },
  {
    type: 'function',
    name: 'merkleRootStore',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
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
    name: 'getRevoteStats',
    stateMutability: 'view',
    inputs: [{ name: 'electionId', type: 'uint256' }],
    outputs: [
      { name: 'totalRevotes', type: 'uint256' },
      { name: 'uniqueVoters', type: 'uint256' },
      { name: 'overwriteRatio', type: 'uint256' },
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

/**
 * Minimal ElectionFactory ABI to resolve per-election AuditView address.
 */
export const ELECTION_FACTORY_GET_ELECTION_ABI = [
  {
    type: 'function',
    name: 'getElection',
    stateMutability: 'view',
    inputs: [{ name: 'electionId', type: 'uint256' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'ballot', type: 'address' },
          { name: 'voteRegistry', type: 'address' },
          { name: 'auditView', type: 'address' },
          {
            name: 'revoteConfig',
            type: 'tuple',
            components: [
              { name: 'enabled', type: 'bool' },
              { name: 'maxVotesPerVoter', type: 'uint16' },
              { name: 'minIntervalSeconds', type: 'uint32' },
              { name: 'policy', type: 'uint8' },
            ],
          },
          { name: 'exists', type: 'bool' },
        ],
      },
    ],
  },
] as const;

/** Reserved candidate id for blank ballots (VoteRegistry.VOTO_BLANCO = uint256.max - 1). */
export const VOTO_BLANCO_CANDIDATE_ID = 2n ** 256n - 2n;

/** Reserved candidate id for null ballots (VoteRegistry.VOTO_NULO = uint256.max). */
export const VOTO_NULO_CANDIDATE_ID = 2n ** 256n - 1n;
