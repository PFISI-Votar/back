import {
  stripBytes32Prefix,
  toBytes32Hex,
} from '@/padron/utils/merkle.util';

describe('merkle.util', () => {
  const validHash =
    'a'.repeat(64);

  describe('toBytes32Hex', () => {
    it('normaliza un hash de 64 hex con prefijo 0x', () => {
      expect(toBytes32Hex(`0x${validHash}`)).toBe(`0x${validHash}`);
    });

    it('normaliza un hash de 64 hex sin prefijo', () => {
      expect(toBytes32Hex(validHash)).toBe(`0x${validHash}`);
    });

    it('rechaza hashes con longitud inválida', () => {
      expect(() => toBytes32Hex('abc')).toThrow(
        'Hash inválido: se esperaban 64 caracteres hex',
      );
    });
  });

  describe('stripBytes32Prefix', () => {
    it('elimina el prefijo 0x en minúsculas', () => {
      expect(stripBytes32Prefix(`0x${validHash}`)).toBe(validHash);
    });

    it('mantiene el hash cuando no tiene prefijo', () => {
      expect(stripBytes32Prefix(validHash)).toBe(validHash);
    });
  });
});
