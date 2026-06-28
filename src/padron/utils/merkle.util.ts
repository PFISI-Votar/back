const REGEX_HEX_64 = /^[0-9a-f]{64}$/i;

/**
 * Normaliza un hash hex de 64 caracteres al formato bytes32 (`0x` + 64 hex).
 */
export function toBytes32Hex(hashHex: string): string {
  const normalized = hashHex.startsWith('0x') ? hashHex.slice(2) : hashHex;
  if (!REGEX_HEX_64.test(normalized)) {
    throw new Error(
      `Hash inválido: se esperaban 64 caracteres hex, recibido "${hashHex}"`,
    );
  }
  return `0x${normalized.toLowerCase()}`;
}

/**
 * Elimina el prefijo `0x` de un hash bytes32 para almacenamiento compacto.
 */
export function stripBytes32Prefix(bytes32Hex: string): string {
  return bytes32Hex.startsWith('0x')
    ? bytes32Hex.slice(2).toLowerCase()
    : bytes32Hex.toLowerCase();
}
