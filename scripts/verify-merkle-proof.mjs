#!/usr/bin/env node
/**
 * UAT-02 (VOTAR-334): verifica que una prueba de pertenencia Merkle reconstruye
 * la raíz del comicio usando StandardMerkleTree (Keccak-256).
 *
 * Uso:
 *   node scripts/verify-merkle-proof.mjs --root 0x... --leaf <hash64> --proof 0x...,0x...
 */
import { StandardMerkleTree } from '@openzeppelin/merkle-tree';

const REGEX_HEX_64 = /^[0-9a-f]{64}$/i;

function printUsage() {
  console.error(`
Uso:
  node scripts/verify-merkle-proof.mjs --root <bytes32> --leaf <hash64> --proof <hex,hex,...>

Opciones:
  --root   Raíz Merkle con prefijo 0x (66 caracteres)
  --leaf   Hash de la hoja sin prefijo 0x (64 hex)
  --proof  Lista de hashes hermanos separados por coma (cada uno con 0x)
`);
}

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const key = argv[i];
    const value = argv[i + 1];
    if (key === '--root') {
      args.root = value;
      i++;
    } else if (key === '--leaf') {
      args.leaf = value;
      i++;
    } else if (key === '--proof') {
      args.proof = value;
      i++;
    }
  }
  return args;
}

function toBytes32Hex(hashHex) {
  const normalized = hashHex.startsWith('0x') ? hashHex.slice(2) : hashHex;
  if (!REGEX_HEX_64.test(normalized)) {
    throw new Error(
      `Leaf inválida: se esperaban 64 hex, recibido "${hashHex}"`,
    );
  }
  return `0x${normalized.toLowerCase()}`;
}

function main() {
  const { root, leaf, proof } = parseArgs(process.argv);
  if (!root || !leaf || !proof) {
    printUsage();
    process.exit(1);
  }

  const proofArray = proof
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  if (proofArray.length === 0) {
    console.error('Error: --proof debe contener al menos un hash hermano.');
    process.exit(1);
  }

  const leafBytes32 = toBytes32Hex(leaf);
  const isValid = StandardMerkleTree.verify(
    root,
    ['bytes32'],
    [leafBytes32],
    proofArray,
  );

  if (isValid) {
    console.log(
      'OK: la prueba de pertenencia es válida para la raíz indicada.',
    );
    process.exit(0);
  }

  console.error('FAIL: la prueba NO reconstruye la raíz Merkle proporcionada.');
  process.exit(1);
}

main();
