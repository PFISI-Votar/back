/**
 * Minimal ABI for MerkleRootStore.sol (US-335 & VOTAR-336).
 * @dev VOTAR-336: Added setElectionState and getElectionState for hermetic seal.
 */
export const MERKLE_ROOT_STORE_ABI = [
  'function publishRoot(uint256 electionId, bytes32 root) external',
  'function getMerkleRoot(uint256 electionId) view returns (bytes32 root, uint256 timestamp)',
  'function isPublished(uint256 electionId) view returns (bool)',
  'function setElectionState(uint256 electionId, uint8 state) external',
  'function getElectionState(uint256 electionId) view returns (uint8)',
  'event RootPublished(uint256 indexed electionId, bytes32 root, uint256 timestamp)',
  'event ElectionStateChanged(uint256 indexed electionId, uint8 newState)',
] as const;
