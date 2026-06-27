import { MerkleBuilderService } from './merkle-builder.service';
import { hashVotante } from '../utils/keccak.util';

describe('MerkleBuilderService', () => {
  let service: MerkleBuilderService;

  beforeEach(() => {
    service = new MerkleBuilderService();
  });

  const buildSampleLeaves = (): string[] => [
    hashVotante('30111222', 'ana@frvm.utn.edu.ar'),
    hashVotante('30222333', 'bruno@frvm.utn.edu.ar'),
    hashVotante('30333444', 'carla@frvm.utn.edu.ar'),
    hashVotante('30444555', 'diego@frvm.utn.edu.ar'),
  ];

  describe('UAT-01: determinismo del sello', () => {
    it('debe generar la misma raíz Merkle en dos invocaciones con el mismo conjunto de hojas', () => {
      const inputLeaves = buildSampleLeaves();
      const shuffledLeaves = [...inputLeaves].reverse();

      const firstBuild = service.buildFromLeaves(inputLeaves);
      const secondBuild = service.buildFromLeaves(shuffledLeaves);

      expect(firstBuild.merkleRoot).toBe(secondBuild.merkleRoot);
      expect(firstBuild.merkleRootCompact).toBe(secondBuild.merkleRootCompact);
      expect(firstBuild.merkleRoot).toMatch(/^0x[0-9a-f]{64}$/);
      expect(firstBuild.merkleRootCompact).toMatch(/^[0-9a-f]{64}$/);
    });

    it('debe ordenar hojas lexicográficamente en indice_hoja', () => {
      const inputLeaves = buildSampleLeaves();
      const actual = service.buildFromLeaves(inputLeaves);
      const expectedOrder = [...inputLeaves].sort((a, b) => a.localeCompare(b));

      expect(actual.sortedLeaves.map((leaf) => leaf.hashHoja)).toEqual(
        expectedOrder,
      );
      actual.sortedLeaves.forEach((leaf, index) => {
        expect(leaf.indiceHoja).toBe(index);
      });
    });
  });

  describe('UAT-02: verificación de credenciales individuales', () => {
    it('debe verificar una proof legítima contra el tree_dump persistido', () => {
      const inputLeaves = buildSampleLeaves();
      const { treeDump, sortedLeaves } = service.buildFromLeaves(inputLeaves);
      const randomIndex = 2;
      const targetLeaf = sortedLeaves[randomIndex];
      const proof = service.getProof(treeDump, targetLeaf.indiceHoja);

      const isValid = service.verifyProof(treeDump, targetLeaf.hashHoja, proof);

      expect(isValid).toBe(true);
    });

    it('debe rechazar una proof manipulada', () => {
      const inputLeaves = buildSampleLeaves();
      const { treeDump, sortedLeaves } = service.buildFromLeaves(inputLeaves);
      const proof = service.getProof(treeDump, 0);
      const corruptedProof = [...proof];
      corruptedProof[0] = corruptedProof[0].replace(/a/g, 'b');

      const isValid = service.verifyProof(
        treeDump,
        sortedLeaves[0].hashHoja,
        corruptedProof,
      );

      expect(isValid).toBe(false);
    });

    it('debe reconstruir la misma raíz desde getRootFromDump', () => {
      const inputLeaves = buildSampleLeaves();
      const { merkleRoot, treeDump } = service.buildFromLeaves(inputLeaves);

      expect(service.getRootFromDump(treeDump)).toBe(merkleRoot);
    });
  });
});
