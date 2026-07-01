import type { StandardMerkleTree } from '@openzeppelin/merkle-tree';

/** Dump serializado de StandardMerkleTree para persistencia en JSONB. */
export type MerkleTreeDump = ReturnType<StandardMerkleTree<string[]>['dump']>;
