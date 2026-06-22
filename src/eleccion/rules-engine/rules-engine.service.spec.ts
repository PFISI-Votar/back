import { RulesEngineService } from '@/eleccion/rules-engine/rules-engine.service';
import { MinimoCandidatosContext } from '@/eleccion/rules-engine/interfaces/minimo-candidatos-context.interface';

describe('RulesEngineService', () => {
  let service: RulesEngineService;

  beforeEach(() => {
    service = new RulesEngineService();
  });

  const buildContext = (
    overrides: Partial<MinimoCandidatosContext> = {},
  ): MinimoCandidatosContext => ({
    categorias: [
      {
        idCategoria: 1,
        nombre: 'Presidente',
        minimoPostulantes: 5,
      },
    ],
    listas: [
      {
        idLista: 10,
        nombre: 'Lista Test',
        sigla: 'LT',
        candidatos: [{ idCategoria: 1 }, { idCategoria: 1 }],
      },
    ],
    ...overrides,
  });

  it('UAT-01: debe rechazar cuando la lista no alcanza el mínimo por categoría', () => {
    const result = service.validateMinimoCandidatos(buildContext());

    expect(result.valid).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]).toMatchObject({
      idLista: 10,
      nombreLista: 'Lista Test',
      idCategoria: 1,
      nombreCategoria: 'Presidente',
      minimoRequerido: 5,
      cantidadActual: 2,
      faltantes: 3,
    });
    expect(result.violations[0].message).toContain(
      'requiere 3 candidato(s) más',
    );
  });

  it('UAT-02: debe aprobar cuando la lista cumple el mínimo por categoría', () => {
    const candidatos = Array.from({ length: 5 }, () => ({ idCategoria: 1 }));
    const result = service.validateMinimoCandidatos(
      buildContext({
        listas: [
          {
            idLista: 10,
            nombre: 'Lista Test',
            sigla: 'LT',
            candidatos,
          },
        ],
      }),
    );

    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('no debe generar violaciones cuando minimoPostulantes es 0', () => {
    const result = service.validateMinimoCandidatos(
      buildContext({
        categorias: [
          {
            idCategoria: 1,
            nombre: 'Presidente',
            minimoPostulantes: 0,
          },
        ],
      }),
    );

    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('debe reportar violaciones por cada lista deficiente', () => {
    const result = service.validateMinimoCandidatos(
      buildContext({
        listas: [
          {
            idLista: 10,
            nombre: 'Lista A',
            sigla: 'LA',
            candidatos: [{ idCategoria: 1 }],
          },
          {
            idLista: 11,
            nombre: 'Lista B',
            sigla: 'LB',
            candidatos: [{ idCategoria: 1 }, { idCategoria: 1 }],
          },
        ],
      }),
    );

    expect(result.valid).toBe(false);
    expect(result.violations).toHaveLength(2);
  });

  it('debe validar cada categoría con mínimo configurado', () => {
    const result = service.validateMinimoCandidatos(
      buildContext({
        categorias: [
          {
            idCategoria: 1,
            nombre: 'Presidente',
            minimoPostulantes: 2,
          },
          {
            idCategoria: 2,
            nombre: 'Vicepresidente',
            minimoPostulantes: 3,
          },
        ],
        listas: [
          {
            idLista: 10,
            nombre: 'Lista Test',
            sigla: 'LT',
            candidatos: [
              { idCategoria: 1 },
              { idCategoria: 1 },
              { idCategoria: 2 },
            ],
          },
        ],
      }),
    );

    expect(result.valid).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].nombreCategoria).toBe('Vicepresidente');
    expect(result.violations[0].faltantes).toBe(2);
  });
});
