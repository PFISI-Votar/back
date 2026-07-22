import { createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Interface, ZeroHash } from 'ethers';

/**
 * VOTAR-385 / UAT-04 — Unit test that mirrors validate:exported-abis without
 * requiring a prior `npm run export:abis` in CI.
 */
describe('VOTAR-385 exported ABI consumption (UAT-04)', () => {
  let fixturesDir: string;

  beforeAll(() => {
    fixturesDir = mkdtempSync(join(tmpdir(), 'votar-385-abis-'));
  });

  afterAll(() => {
    rmSync(fixturesDir, { recursive: true, force: true });
  });

  it('encodes publishRoot from a full MerkleRootStore-style ABI JSON', () => {
    const abi = [
      {
        type: 'function',
        name: 'publishRoot',
        stateMutability: 'nonpayable',
        inputs: [
          { name: 'electionId', type: 'uint256' },
          { name: 'root', type: 'bytes32' },
        ],
        outputs: [],
      },
    ];
    const abiHash = `0x${createHash('sha256')
      .update(JSON.stringify(abi))
      .digest('hex')}`;
    const payload = {
      contractName: 'MerkleRootStore',
      abiHash,
      abi,
      exportedAt: new Date().toISOString(),
      source: 'test-fixture',
    };
    const path = join(fixturesDir, 'MerkleRootStore.json');
    writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

    const loaded = JSON.parse(readFileSync(path, 'utf8')) as typeof payload;
    expect(loaded.abiHash).toBe(abiHash);

    const iface = new Interface(loaded.abi);
    const data = iface.encodeFunctionData('publishRoot', [1n, ZeroHash]);
    expect(data.startsWith('0x')).toBe(true);
    expect(data.length).toBeGreaterThan(10);
  });

  it('encodes createElection from an ElectionFactory-style ABI JSON', () => {
    const abi = [
      {
        type: 'function',
        name: 'createElection',
        stateMutability: 'nonpayable',
        inputs: [
          { name: 'electionId', type: 'uint256' },
          {
            name: 'revoteConfig',
            type: 'tuple',
            components: [
              { name: 'enabled', type: 'bool' },
              { name: 'maxVotesPerVoter', type: 'uint16' },
              { name: 'minIntervalSeconds', type: 'uint32' },
              { name: 'policy', type: 'uint8' },
            ],
          },
        ],
        outputs: [
          { name: 'ballot', type: 'address' },
          { name: 'voteRegistry', type: 'address' },
          { name: 'auditView', type: 'address' },
        ],
      },
    ];
    const iface = new Interface(abi);
    const data = iface.encodeFunctionData('createElection', [
      42n,
      {
        enabled: false,
        maxVotesPerVoter: 1,
        minIntervalSeconds: 0,
        policy: 0,
      },
    ]);
    expect(data.slice(0, 10)).toMatch(/^0x[0-9a-f]{8}$/);
  });
});
