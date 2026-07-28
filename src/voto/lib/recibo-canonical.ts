/**
 * Canonical receipt payload for system DigitalSignature (VOTAR-360).
 * Must stay byte-identical between backend signing and frontend display/verify.
 */
export const RECIBO_CANONICAL_VERSION = 'VOTAR-RECIBO-v1';

export type ReciboCanonicalFields = {
  idEleccion: number;
  txHash: string;
  blockNumber: number;
  timestamp: string;
};

export function buildReciboCanonicalPayload(
  fields: ReciboCanonicalFields,
): string {
  const txHash = fields.txHash.toLowerCase();
  return [
    RECIBO_CANONICAL_VERSION,
    `idEleccion=${fields.idEleccion}`,
    `txHash=${txHash}`,
    `blockNumber=${fields.blockNumber}`,
    `timestamp=${fields.timestamp}`,
  ].join('|');
}

export const TX_HASH_REGEX = /^0x[0-9a-fA-F]{64}$/;
