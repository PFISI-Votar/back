import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { Interface, ZeroHash } from 'ethers';

type ExportedAbiPayload = {
  contractName: string;
  abiHash: string;
  abi: unknown[];
};

const ABIS_DIR = resolve(__dirname, '../src/blockchain/abis');

const REQUIRED_EXPORTS: Array<{
  file: string;
  encode: (iface: Interface) => string;
}> = [
  {
    file: 'MerkleRootStore.json',
    encode: (iface) =>
      iface.encodeFunctionData('publishRoot', [1n, ZeroHash]),
  },
  {
    file: 'ElectionFactory.json',
    encode: (iface) =>
      iface.encodeFunctionData('createElection', [
        1n,
        {
          enabled: false,
          maxVotesPerVoter: 1,
          minIntervalSeconds: 0,
          policy: 0,
        },
      ]),
  },
];

const loadPayload = (fileName: string): ExportedAbiPayload => {
  const path = resolve(ABIS_DIR, fileName);
  if (!existsSync(path)) {
    throw new Error(
      `Missing exported ABI at ${path}. Run: cd ../blockchain && npm run export:abis`,
    );
  }
  return JSON.parse(readFileSync(path, 'utf8')) as ExportedAbiPayload;
};

/**
 * VOTAR-385 / UAT-04 — Confirms NestJS can build calldata from exported ABIs.
 *
 * Usage (from back/):
 *   npm run validate:exported-abis
 */
function main() {
  const jsonFiles = existsSync(ABIS_DIR)
    ? readdirSync(ABIS_DIR).filter((f) => f.endsWith('.json'))
    : [];

  if (jsonFiles.length === 0) {
    throw new Error(
      `No ABI JSON files in ${ABIS_DIR}. Run: cd ../blockchain && npm run export:abis`,
    );
  }

  console.log(`[validate:exported-abis] Found ${jsonFiles.length} ABI file(s)`);

  for (const spec of REQUIRED_EXPORTS) {
    const payload = loadPayload(spec.file);
    const expectedHash = `0x${createHash('sha256')
      .update(JSON.stringify(payload.abi))
      .digest('hex')}`;

    if (payload.abiHash !== expectedHash) {
      throw new Error(
        `${spec.file}: abiHash mismatch (file=${payload.abiHash}, computed=${expectedHash})`,
      );
    }

    const iface = new Interface(payload.abi as never);
    const calldata = spec.encode(iface);
    if (!calldata.startsWith('0x') || calldata.length < 10) {
      throw new Error(`${spec.file}: failed to encode test calldata`);
    }

    console.log(
      `[validate:exported-abis] OK ${basename(spec.file)} selector=${calldata.slice(0, 10)}`,
    );
  }

  console.log('[validate:exported-abis] All exported ABIs are usable from NestJS');
}

main();
