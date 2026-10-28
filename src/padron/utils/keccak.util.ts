import { keccak256 } from 'js-sha3';
import { CriterioHashPadron } from '../enums/criterio-hash-padron.enum';

export { CriterioHashPadron };

/**
 * Hashea la identidad de un votante con Keccak-256 según el criterio del padrón.
 * Normaliza: DNI a sólo dígitos, email a minúsculas sin espacios.
 * Devuelve hex de 64 caracteres (256 bits), sin prefijo `0x`.
 */
export function hashVotante(
  dni?: string | null,
  email?: string | null,
  criterio: CriterioHashPadron = CriterioHashPadron.DNI,
): string {
  const dniNormalizado = (dni ?? '').trim().replace(/\D/g, '');
  const emailNormalizado = (email ?? '').trim().toLowerCase();

  switch (criterio) {
    case CriterioHashPadron.EMAIL:
      return keccak256(emailNormalizado);
    case CriterioHashPadron.DNI_Y_EMAIL:
      return keccak256(`${dniNormalizado}:${emailNormalizado}`);
    case CriterioHashPadron.DNI:
    default:
      return keccak256(dniNormalizado);
  }
}

/**
 * @deprecated Usar MerkleBuilderService.buildFromLeaves() para el sello del padrón.
 * Hash plano legacy; reemplazado por raíz Merkle Keccak-256 (VOTAR-334).
 */
export function hashPadron(hashesHoja: string[]): string {
  return keccak256([...hashesHoja].sort().join(''));
}
