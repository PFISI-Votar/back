/**
 * Fragmentos para transmitir y decodificar castSignedVote (VOTAR-497).
 * Alineado con BallotContract.sol y los errores de VoteRegistry que burbujean.
 */
export const BALLOT_CAST_ABI = [
  {
    type: 'function',
    name: 'castSignedVote',
    stateMutability: 'nonpayable',
    inputs: [
      {
        name: 'vote',
        type: 'tuple',
        components: [
          { name: 'electionId', type: 'uint256' },
          { name: 'voterLeaf', type: 'bytes32' },
          { name: 'nullifier', type: 'bytes32' },
          { name: 'selectionHash', type: 'bytes32' },
          { name: 'candidateIds', type: 'uint256[]' },
          { name: 'timestamp', type: 'uint256' },
          { name: 'expectedSigner', type: 'address' },
        ],
      },
      { name: 'merkleProof', type: 'bytes32[]' },
      { name: 'signature', type: 'bytes' },
      { name: 'validatorSignature', type: 'bytes' },
    ],
    outputs: [],
  },
  { type: 'error', name: 'InvalidMerkleProof', inputs: [] },
  {
    type: 'error',
    name: 'MerkleRootNotPublished',
    inputs: [{ name: 'electionId', type: 'uint256' }],
  },
  { type: 'error', name: 'RevoteDisabled', inputs: [] },
  { type: 'error', name: 'AlreadyVoted', inputs: [] },
  { type: 'error', name: 'InvalidSignature', inputs: [] },
  { type: 'error', name: 'MissingValidatorSignature', inputs: [] },
  { type: 'error', name: 'InvalidValidatorSignature', inputs: [] },
  {
    type: 'error',
    name: 'ElectionClosed',
    inputs: [{ name: 'electionId', type: 'uint256' }],
  },
  {
    type: 'error',
    name: 'MaxVotesReached',
    inputs: [
      { name: 'electionId', type: 'uint256' },
      { name: 'maxVotes', type: 'uint16' },
    ],
  },
  {
    type: 'error',
    name: 'RetryTooSoon',
    inputs: [
      { name: 'electionId', type: 'uint256' },
      { name: 'remainingSeconds', type: 'uint256' },
    ],
  },
  { type: 'error', name: 'NullifierAlreadyUsed', inputs: [] },
  {
    type: 'error',
    name: 'CandidateSetNotRegistered',
    inputs: [{ name: 'electionId', type: 'uint256' }],
  },
  {
    type: 'error',
    name: 'InvalidCandidateId',
    inputs: [
      { name: 'electionId', type: 'uint256' },
      { name: 'candidateId', type: 'uint256' },
    ],
  },
  { type: 'error', name: 'EnforcedPause', inputs: [] },
] as const;
