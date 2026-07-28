export interface PublishMerkleRootResult {
  txHash: string;
  blockNumber: number;
  contractAddress: string;
  publishedAt: Date;
  electionId: number;
  merkleRoot: string;
}
