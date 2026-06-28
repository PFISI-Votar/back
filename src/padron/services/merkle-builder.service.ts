import { Injectable } from '@nestjs/common';
import { StandardMerkleTree } from '@openzeppelin/merkle-tree';
import { MerkleTreeDump } from '../types/merkle-tree-dump.type';
import { stripBytes32Prefix, toBytes32Hex } from '../utils/merkle.util';

export interface MerkleLeafEntry {
  hashHoja: string;
  indiceHoja: number;
}

export interface MerkleBuildResult {
  /** Raíz con prefijo `0x` (bytes32). */
  merkleRoot: string;
  /** Raíz sin prefijo `0x` (64 hex) para `padron_electoral.hash_padron`. */
  merkleRootCompact: string;
  treeDump: MerkleTreeDump;
  sortedLeaves: MerkleLeafEntry[];
}

@Injectable()
export class MerkleBuilderService {
  /**
   * Construye un Árbol de Merkle determinístico (Keccak-256 vía StandardMerkleTree)
   * a partir de las hojas hasheadas del padrón.
   */
  buildFromLeaves(hashes: string[]): MerkleBuildResult {
    const sorted = [...hashes].sort((a, b) => a.localeCompare(b));
    const values = sorted.map((hash) => [toBytes32Hex(hash)]);
    const tree = StandardMerkleTree.of(values, ['bytes32']);
    const merkleRoot = tree.root;
    const sortedLeaves = sorted.map((hashHoja, indiceHoja) => ({
      hashHoja,
      indiceHoja,
    }));
    return {
      merkleRoot,
      merkleRootCompact: stripBytes32Prefix(merkleRoot),
      treeDump: tree.dump(),
      sortedLeaves,
    };
  }

  /**
   * Obtiene la prueba de pertenencia on-demand desde el dump persistido.
   */
  getProof(treeDump: MerkleTreeDump, leafIndex: number): string[] {
    const tree = StandardMerkleTree.load(treeDump);
    return tree.getProof(leafIndex);
  }

  /**
   * Verifica que una hoja y su proof reconstruyen la raíz del árbol.
   */
  verifyProof(
    treeDump: MerkleTreeDump,
    leafHash: string,
    proof: string[],
  ): boolean {
    const tree = StandardMerkleTree.load(treeDump);
    return tree.verify([toBytes32Hex(leafHash)], proof);
  }

  /** Expone la raíz del árbol cargado desde dump (para auditoría). */
  getRootFromDump(treeDump: MerkleTreeDump): string {
    const tree = StandardMerkleTree.load(treeDump);
    return tree.root;
  }
}
