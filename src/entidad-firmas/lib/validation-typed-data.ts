import { TypedDataDomain, TypedDataField } from 'ethers';

/**
 * VOTAR-377 — EIP-712 `Validation` typed data. Espejo EXACTO de
 * `BallotContract.VALIDATION_TYPEHASH` y del dominio `EIP712("VOTAR","1")`.
 *
 * Cubre la totalidad del payload que determina el resultado del sufragio, más
 * `expectedSigner` (ata la firma institucional a la del votante). Excluye
 * `voterLeaf` a propósito: la firma que queda en la calldata de Sepolia no debe
 * permitir volver a la hoja del padrón.
 */
export const VALIDATION_EIP712_TYPES: Record<string, TypedDataField[]> = {
  Validation: [
    { name: 'electionId', type: 'uint256' },
    { name: 'nullifier', type: 'bytes32' },
    { name: 'selectionHash', type: 'bytes32' },
    { name: 'candidateId', type: 'uint256' },
    { name: 'timestamp', type: 'uint256' },
    { name: 'expectedSigner', type: 'address' },
  ],
};

export interface ValidationMessage {
  electionId: bigint;
  nullifier: string;
  selectionHash: string;
  candidateId: bigint;
  timestamp: bigint;
  expectedSigner: string;
}

export function buildValidationDomain(
  chainId: number,
  ballotContractAddress: string,
): TypedDataDomain {
  return {
    name: 'VOTAR',
    version: '1',
    chainId,
    verifyingContract: ballotContractAddress,
  };
}
