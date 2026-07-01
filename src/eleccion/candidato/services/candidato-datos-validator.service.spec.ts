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

  it('debe validar url, fecha y booleano', () => {
    const extraCampos: CampoCandidatoDefinicion[] = [
      {
        clave: 'web',
        etiqueta: 'Sitio web',
        tipo: 'url',
        obligatorio: true,
        orden: 4,
      },
      {
        clave: 'nacimiento',
        etiqueta: 'Nacimiento',
        tipo: 'fecha',
        obligatorio: true,
        orden: 5,
      },
      {
        clave: 'acepta',
        etiqueta: 'Acepta términos',
        tipo: 'booleano',
        obligatorio: true,
        orden: 6,
      },
    ];

    expect(() =>
      service.validateDatosAdicionales(extraCampos, {
        web: 'https://votar.net.ar',
        nacimiento: '1990-01-15',
        acepta: true,
      }),
    ).not.toThrow();

    expect(() =>
      service.validateDatosAdicionales(extraCampos, {
        web: 'ftp://votar.net.ar',
        nacimiento: '1990-01-15',
        acepta: true,
      }),
    ).toThrow(DatosAdicionalesValidationException);

    expect(() =>
      service.validateDatosAdicionales(extraCampos, {
        web: 'https://votar.net.ar',
        nacimiento: 'fecha-invalida',
        acepta: true,
      }),
    ).toThrow(DatosAdicionalesValidationException);

    expect(() =>
      service.validateDatosAdicionales(extraCampos, {
        web: 'https://votar.net.ar',
        nacimiento: '1990-01-15',
        acepta: 'si',
      }),
    ).toThrow(DatosAdicionalesValidationException);
  });

  it('debe rechazar tipo de campo desconocido', () => {
    const invalidCampos = [
      {
        clave: 'x',
        etiqueta: 'X',
        tipo: 'desconocido',
        obligatorio: true,
        orden: 1,
      },
    ] as CampoCandidatoDefinicion[];

    expect(() =>
      service.validateDatosAdicionales(invalidCampos, { x: 'valor' }),
    ).toThrow(DatosAdicionalesValidationException);
  });
});
