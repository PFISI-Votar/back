/**
 * Minimal VoteRegistry ABI for VoteCast timeline queries (VOTAR-346 / VOTAR-365)
 * and VoteUpdated audit queries (VOTAR-326 — política LAST_WINS).
 */
export const VOTE_REGISTRY_CONTRACT_ABI = [
  {
    type: 'function',
    name: 'registerCandidates',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'electionId', type: 'uint256' },
      { name: 'ids', type: 'uint256[]' },
    ],
    outputs: [],
  },
  {
    type: 'event',
    name: 'CandidateSetRegistered',
    inputs: [
      { name: 'electionId', type: 'uint256', indexed: true },
      { name: 'candidateCount', type: 'uint256', indexed: false },
    ],
  },
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
  // VOTAR-345 — required so ethers can decode registerCandidates reverts;
  // without these fragments the error surfaces as "unknown custom error"
  // and BlockchainService's string-match error handling never triggers.
  {
    type: 'error',
    name: 'CandidateSetSealed',
    inputs: [{ name: 'electionId', type: 'uint256' }],
  },
  {
    type: 'error',
    name: 'CandidateSetNotRegistered',
    inputs: [{ name: 'electionId', type: 'uint256' }],
  },
  {
    type: 'error',
    name: 'ReservedCandidateId',
    inputs: [{ name: 'candidateId', type: 'uint256' }],
  },
  {
    type: 'error',
    name: 'EmptyCandidateSet',
    inputs: [],
  },
  {
    type: 'error',
    name: 'InvalidCandidateId',
    inputs: [
      { name: 'electionId', type: 'uint256' },
      { name: 'candidateId', type: 'uint256' },
    ],
  },
  // OpenZeppelin AccessControl — inherited by VoteRegistry via VotarAccessControl.
  {
    type: 'error',
    name: 'AccessControlUnauthorizedAccount',
    inputs: [
      { name: 'account', type: 'address' },
      { name: 'neededRole', type: 'bytes32' },
    ],
  },
] as const;
