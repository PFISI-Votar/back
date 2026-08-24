/**
 * Minimal BallotContract ABI for VOTAR-360 receipt verification.
 * Aligned with BallotContract.sol SignedVoteCast (VOTAR-346: no voterLeaf —
 * prevents join leaf↔nullifier↔candidateId with VoteCast).
 */
export const BALLOT_CONTRACT_ABI = [
  {
    type: 'event',
    name: 'SignedVoteCast',
    inputs: [
      { name: 'electionId', type: 'uint256', indexed: true },
      { name: 'nullifier', type: 'bytes32', indexed: true },
      { name: 'selectionHash', type: 'bytes32', indexed: false },
      { name: 'signer', type: 'address', indexed: false },
    ],
  },
  // VOTAR-347 — pause/unpause (VotarAccessControl, PAUSER_ROLE). `pause` is
  // overloaded (zero-arg + reason); ethers needs both fragments to resolve
  // the qualified selector `pause(string)` used by BlockchainService.pauseContract.
  {
    type: 'function',
    name: 'pause',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [],
  },
  {
    type: 'function',
    name: 'pause',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'reason', type: 'string' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'unpause',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [],
  },
  // Required so ethers can decode pause/unpause reverts (EnforcedPause when
  // already paused, ExpectedPause on unpause when not paused) instead of
  // surfacing "unknown custom error".
  {
    type: 'error',
    name: 'EnforcedPause',
    inputs: [],
  },
  {
    type: 'error',
    name: 'ExpectedPause',
    inputs: [],
  },
  // OpenZeppelin AccessControl — inherited by BallotContract via VotarAccessControl.
  {
    type: 'error',
    name: 'AccessControlUnauthorizedAccount',
    inputs: [
      { name: 'account', type: 'address' },
      { name: 'neededRole', type: 'bytes32' },
    ],
  },
] as const;
