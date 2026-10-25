import {
  OBSERVACION_LOGIN_DEFAULT,
  parseObservacionLogin,
} from '@/eleccion/constants/observacion-login.constant';

describe('parseObservacionLogin', () => {
  it('devuelve el texto recortado cuando hay contenido', () => {
    const actual = parseObservacionLogin('  Usá tu cuenta institucional.  ');

    expect(actual).toBe('Usá tu cuenta institucional.');
  });

  it('devuelve null si el valor queda vacío (oculta el recuadro de login)', () => {
    expect(parseObservacionLogin('')).toBeNull();
    expect(parseObservacionLogin('   ')).toBeNull();
  });

  it('conserva el texto por defecto de la BUD', () => {
    expect(parseObservacionLogin(OBSERVACION_LOGIN_DEFAULT)).toBe(
      OBSERVACION_LOGIN_DEFAULT,
    );
  });
});
