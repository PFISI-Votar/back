/**
 * Minimal ABI for MerkleRootStore.sol (US-335).
 */
export const MERKLE_ROOT_STORE_ABI = [
  'function publishRoot(uint256 electionId, bytes32 root) external',
  'function getMerkleRoot(uint256 electionId) view returns (bytes32 root, uint256 timestamp)',
  'function isPublished(uint256 electionId) view returns (bool)',
  'event RootPublished(uint256 indexed electionId, bytes32 root, uint256 timestamp)',
] as const;
