import { keccak256 } from 'js-sha3';

/**
 * Hashea la identidad compuesta de un votante con Keccak-256.
 * Normaliza: DNI a sólo dígitos, email a minúsculas sin espacios.
 * Devuelve hex de 64 caracteres (256 bits), sin prefijo `0x`.
 */
export function hashVotante(dni: string, email: string): string {
  const dniNormalizado = dni.trim().replace(/\D/g, '');
  const emailNormalizado = email.trim().toLowerCase();
  return keccak256(`${dniNormalizado}:${emailNormalizado}`);
}

/**
 * @deprecated Usar MerkleBuilderService.buildFromLeaves() para el sello del padrón.
 * Hash plano legacy; reemplazado por raíz Merkle Keccak-256 (VOTAR-334).
 */
export function hashPadron(hashesHoja: string[]): string {
  return keccak256([...hashesHoja].sort().join(''));
}
