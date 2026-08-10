/**
 * Minimal ElectionFactory ABI to resolve per-election contract addresses (VOTAR-337).
 */
export const ELECTION_FACTORY_CONTRACT_ABI = [
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
  {
    type: 'function',
    name: 'createElection',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'electionId', type: 'uint256' },
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
    ],
    outputs: [
      { name: 'ballot', type: 'address' },
      { name: 'voteRegistry', type: 'address' },
      { name: 'auditView', type: 'address' },
    ],
  },
  // VOTAR-434 — required so ethers can decode createElection reverts from
  // raw send() estimateGas failures ("unknown custom error" + .data).
  {
    type: 'error',
    name: 'ElectionAlreadyExists',
    inputs: [{ name: 'electionId', type: 'uint256' }],
  },
  {
    type: 'error',
    name: 'AccessControlUnauthorizedAccount',
    inputs: [
      { name: 'account', type: 'address' },
      { name: 'neededRole', type: 'bytes32' },
    ],
  },
] as const;
