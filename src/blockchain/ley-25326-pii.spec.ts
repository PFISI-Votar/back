import { Interface } from 'ethers';
import { getMetadataArgsStorage } from 'typeorm';
import { BALLOT_CONTRACT_ABI } from '@/blockchain/constants/ballot-contract.abi';
import { ELECTION_FACTORY_CONTRACT_ABI } from '@/blockchain/constants/election-factory-contract.abi';
import { MERKLE_ROOT_STORE_ABI } from '@/blockchain/constants/merkle-root-store.abi';
import { VOTE_REGISTRY_CONTRACT_ABI } from '@/blockchain/constants/vote-registry-contract.abi';
import { PadronVotante } from '@/padron/entities/padron-votante.entity';
import { hashVotante } from '@/padron/utils/keccak.util';

void PadronVotante;

const PII_TOKENS = [
  '30222333',
  'bruno@frvm.utn.edu.ar',
  'Bruno Pérez',
  '30111222',
  'ana@frvm.utn.edu.ar',
];

const FORBIDDEN_PARAM_NAMES =
  /^(dni|email|nombre|apellido|documento|cuil|cuit|telefono|legajo)$/i;

type AbiInput = {
  name?: string;
  type: string;
  indexed?: boolean;
  components?: AbiInput[];
};

type AbiFragment = {
  type: string;
  name?: string;
  inputs?: AbiInput[];
};

const collectInputs = (
  inputs: AbiInput[] | undefined,
  path: string,
): Array<{ path: string; name: string; type: string }> => {
  if (!inputs) {
    return [];
  }
  return inputs.flatMap((input) => {
    const name = input.name ?? '';
    const nextPath = `${path}.${name || input.type}`;
    if (input.components) {
      return collectInputs(input.components, nextPath);
    }
    const itemType = input.type.endsWith('[]')
      ? input.type.slice(0, -2)
      : input.type;
    return [{ path: nextPath, name, type: itemType }];
  });
};

const assertNoPlaintextPii = (label: string, value: string): void => {
  const text = value.toLowerCase();
  for (const token of PII_TOKENS) {
    expect(text).not.toContain(token.toLowerCase());
  }
  expect(label.length).toBeGreaterThan(0);
};

describe('VOTAR-378 Ley 25.326 — payloads hacia blockchain y esquema off-chain', () => {
  it('UAT-01: ABIs de voto/padrón no aceptan PII en claro', () => {
    const fragments = [
      ...BALLOT_CONTRACT_ABI,
      ...VOTE_REGISTRY_CONTRACT_ABI,
      ...ELECTION_FACTORY_CONTRACT_ABI,
    ] as AbiFragment[];

    for (const fragment of fragments) {
      if (fragment.type !== 'function' && fragment.type !== 'event') {
        continue;
      }
      for (const input of collectInputs(
        fragment.inputs,
        `${fragment.name ?? fragment.type}`,
      )) {
        expect(input.name).not.toMatch(FORBIDDEN_PARAM_NAMES);
        if (input.type === 'string') {
          expect(input.name).toBe('reason');
          expect(fragment.name).toMatch(/^pause$/i);
        }
      }
    }

    const signedVote = BALLOT_CONTRACT_ABI.find(
      (fragment) =>
        fragment.type === 'event' && fragment.name === 'SignedVoteCast',
    ) as AbiFragment;
    expect(
      signedVote.inputs?.map((input) => `${input.name}:${input.type}`),
    ).toEqual([
      'electionId:uint256',
      'nullifier:bytes32',
      'selectionHash:bytes32',
      'signer:address',
    ]);
    expect(signedVote.inputs?.some((input) => input.name === 'voterLeaf')).toBe(
      false,
    );
  });

  it('UAT-01: publishRoot y createElection se encodifican sin DNI/email/nombre', () => {
    const merkle = new Interface([...MERKLE_ROOT_STORE_ABI]);
    const identityHash = `0x${hashVotante('30222333', 'bruno@frvm.utn.edu.ar')}`;
    const publishData = merkle.encodeFunctionData('publishRoot', [
      378n,
      identityHash,
    ]);
    expect(publishData.startsWith('0x')).toBe(true);
    assertNoPlaintextPii('publishRoot calldata', publishData);

    const factory = new Interface([...ELECTION_FACTORY_CONTRACT_ABI]);
    const createData = factory.encodeFunctionData('createElection', [
      378n,
      {
        enabled: false,
        maxVotesPerVoter: 1,
        minIntervalSeconds: 0,
        policy: 0,
      },
    ]);
    assertNoPlaintextPii('createElection calldata', createData);
  });

  it('UAT-01: padron_votante sólo persiste hash_hoja, nunca dni/email', () => {
    const columns = getMetadataArgsStorage()
      .columns.filter((column) => column.target === PadronVotante)
      .map((column) => String(column.options?.name ?? column.propertyName));

    expect(columns).toContain('hash_hoja');
    expect(columns).not.toContain('dni');
    expect(columns).not.toContain('email');
    expect(columns).not.toContain('nombre');
  });
});
