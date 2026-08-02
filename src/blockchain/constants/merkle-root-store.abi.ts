/**
 * Minimal ABI for MerkleRootStore.sol (US-335, VOTAR-336, VOTAR-321, VOTAR-327).
 * @dev VOTAR-336: setElectionState / getElectionState for hermetic seal.
 * @dev VOTAR-321: election window for autonomous on-chain closure.
 * @dev VOTAR-327: lockConfig / isConfigLocked seal the voting window.
 */
export const MERKLE_ROOT_STORE_ABI = [
  'function publishRoot(uint256 electionId, bytes32 root) external',
  'function getMerkleRoot(uint256 electionId) view returns (bytes32 root, uint256 timestamp)',
  'function isPublished(uint256 electionId) view returns (bool)',
  'function setElectionState(uint256 electionId, uint8 state) external',
  'function getElectionState(uint256 electionId) view returns (uint8)',
  'function setElectionWindow(uint256 electionId, uint256 startTime, uint256 endTime) external',
  'function getElectionEndTime(uint256 electionId) view returns (uint256)',
  'function getElectionWindow(uint256 electionId) view returns (uint256 startTime, uint256 endTime)',
  'function lockConfig(uint256 electionId) external',
  'function isConfigLocked(uint256 electionId) view returns (bool)',
  'event RootPublished(uint256 indexed electionId, bytes32 root, uint256 timestamp)',
  'event ElectionStateChanged(uint256 indexed electionId, uint8 newState)',
  'event ElectionWindowSet(uint256 indexed electionId, uint256 startTime, uint256 endTime)',
  'event ConfigurationLocked(uint256 indexed electionId)',
  // VOTAR-327 — required so ethers can decode lockConfig/setElectionWindow
  // reverts; without this fragment the error surfaces as "unknown custom
  // error" and BlockchainService's string-match error handling never fires.
  'error ConfigLocked(uint256 electionId)',
  // OpenZeppelin AccessControl — inherited via VotarAccessControl.
  'error AccessControlUnauthorizedAccount(address account, bytes32 neededRole)',
] as const;
