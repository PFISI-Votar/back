import { hashPadron, hashVotante } from '../utils/keccak.util';

describe('keccak.util', () => {
  const REGEX_KECCAK = /^[0-9a-f]{64}$/;

  describe('hashVotante', () => {
    it('debe producir un hash Keccak-256 de 64 caracteres hexadecimales (256 bits)', () => {
      const actual = hashVotante('30111222', 'ana@frvm.utn.edu.ar');

      expect(actual).toMatch(REGEX_KECCAK);
      expect(actual.length).toBe(64);
    });

    it('debe ser determinístico para la misma identidad', () => {
      const inputDni = '30111222';
      const inputEmail = 'ana@frvm.utn.edu.ar';

      expect(hashVotante(inputDni, inputEmail)).toBe(
        hashVotante(inputDni, inputEmail),
      );
    });

    it('debe normalizar DNI (sólo dígitos) y email (minúsculas)', () => {
      expect(hashVotante('30.111.222', ' ANA@FRVM.UTN.EDU.AR ')).toBe(
        hashVotante('30111222', 'ana@frvm.utn.edu.ar'),
      );
    });

    it('no debe exponer el texto plano de la identidad en el hash', () => {
      const inputDni = '30111222';
      const actual = hashVotante(inputDni, 'ana@frvm.utn.edu.ar');

      expect(actual).not.toContain(inputDni);
      expect(actual).not.toContain('ana');
    });
  });

  describe('hashPadron', () => {
    it('debe ser independiente del orden de las hojas', () => {
      const hojaA = hashVotante('30111222', 'a@frvm.utn.edu.ar');
      const hojaB = hashVotante('30111333', 'b@frvm.utn.edu.ar');

      expect(hashPadron([hojaA, hojaB])).toBe(hashPadron([hojaB, hojaA]));
    });
  });
});
