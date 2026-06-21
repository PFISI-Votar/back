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
 * Hash determinístico del padrón completo a partir de las hojas hasheadas.
 * Ordena las hojas para que el resultado sea independiente del orden del CSV.
 */
export function hashPadron(hashesHoja: string[]): string {
  return keccak256([...hashesHoja].sort().join(''));
}
