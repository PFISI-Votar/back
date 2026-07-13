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
] as const;
