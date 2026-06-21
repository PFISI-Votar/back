import { CandidatoDatosValidatorService } from '@/eleccion/candidato/services/candidato-datos-validator.service';
import { DatosAdicionalesValidationException } from '@/eleccion/candidato/exceptions/datos-adicionales-validation.exception';
import { CampoCandidatoDefinicion } from '@/eleccion/candidato/interfaces/campo-candidato-definicion.interface';

describe('CandidatoDatosValidatorService', () => {
  let service: CandidatoDatosValidatorService;

  const campos: CampoCandidatoDefinicion[] = [
    {
      clave: 'legajo_utn',
      etiqueta: 'Legajo UTN',
      tipo: 'texto',
      obligatorio: true,
      orden: 1,
      validacion: { pattern: '^\\d{4,6}$', patternMessage: 'Legajo inválido' },
    },
    {
      clave: 'cantidad_avales',
      etiqueta: 'Avales',
      tipo: 'numero',
      obligatorio: true,
      orden: 2,
      validacion: { min: 1 },
    },
    {
      clave: 'email_contacto',
      etiqueta: 'Email',
      tipo: 'email',
      obligatorio: false,
      orden: 3,
    },
  ];

  beforeEach(() => {
    service = new CandidatoDatosValidatorService();
  });

  it('debe validar datos correctos', () => {
    expect(() =>
      service.validateDatosAdicionales(campos, {
        legajo_utn: '14988',
        cantidad_avales: 2,
      }),
    ).not.toThrow();
  });

  it('debe rechazar campo obligatorio faltante', () => {
    expect(() =>
      service.validateDatosAdicionales(campos, { cantidad_avales: 2 }),
    ).toThrow(DatosAdicionalesValidationException);
    try {
      service.validateDatosAdicionales(campos, { cantidad_avales: 2 });
    } catch (error) {
      const response = (
        error as DatosAdicionalesValidationException
      ).getResponse() as {
        errors: { clave: string }[];
      };
      expect(response.errors.some((e) => e.clave === 'legajo_utn')).toBe(true);
    }
  });

  it('debe rechazar patrón inválido en texto', () => {
    expect(() =>
      service.validateDatosAdicionales(campos, {
        legajo_utn: 'abc',
        cantidad_avales: 2,
      }),
    ).toThrow(DatosAdicionalesValidationException);
  });

  it('debe rechazar número menor al mínimo', () => {
    expect(() =>
      service.validateDatosAdicionales(campos, {
        legajo_utn: '14988',
        cantidad_avales: 0,
      }),
    ).toThrow(DatosAdicionalesValidationException);
  });

  it('debe rechazar campos no definidos en la configuración', () => {
    expect(() =>
      service.validateDatosAdicionales(campos, {
        legajo_utn: '14988',
        cantidad_avales: 2,
        campo_extra: 'x',
      }),
    ).toThrow(DatosAdicionalesValidationException);
  });

  it('debe validar email opcional omitido', () => {
    expect(() =>
      service.validateDatosAdicionales(campos, {
        legajo_utn: '14988',
        cantidad_avales: 2,
      }),
    ).not.toThrow();
  });

  it('debe rechazar email inválido', () => {
    expect(() =>
      service.validateDatosAdicionales(campos, {
        legajo_utn: '14988',
        cantidad_avales: 2,
        email_contacto: 'no-es-email',
      }),
    ).toThrow(DatosAdicionalesValidationException);
  });
});
