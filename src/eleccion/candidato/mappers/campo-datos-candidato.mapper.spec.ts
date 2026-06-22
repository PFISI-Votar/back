import { TipoCampoCandidatoEnum } from '@/eleccion/candidato/enums/tipo-campo-candidato.enum';
import { CampoDatosCandidato } from '@/eleccion/candidato/entities/campo-datos-candidato.entity';
import {
  mapDefinicionToEntity,
  mapEntityToDefinicion,
} from '@/eleccion/candidato/mappers/campo-datos-candidato.mapper';

describe('campo-datos-candidato.mapper', () => {
  it('debe mapear definición a entidad y viceversa', () => {
    const definicion = {
      clave: 'dni',
      etiqueta: 'DNI',
      tipo: 'numero' as const,
      obligatorio: true,
      orden: 1,
      ejemplo: '45703625',
      ayuda: 'Documento nacional de identidad',
      validacion: { min: 100000 },
    };
    const entity = mapDefinicionToEntity(definicion);
    expect(entity.clave).toBe('dni');
    expect(entity.minValor).toBe(100000);
    const roundTrip = mapEntityToDefinicion(entity);
    expect(roundTrip).toEqual(definicion);
  });

  it('debe omitir validacion vacía al mapear entidad a definición', () => {
    const entity = new CampoDatosCandidato();
    entity.clave = 'propuesta';
    entity.etiqueta = 'Propuesta';
    entity.tipo = TipoCampoCandidatoEnum.TEXTO;
    entity.obligatorio = true;
    entity.orden = 1;
    entity.ejemplo = null;
    entity.ayuda = null;
    entity.minLength = null;
    entity.maxLength = null;
    entity.minValor = null;
    entity.maxValor = null;
    entity.pattern = null;
    entity.patternMessage = null;
    const definicion = mapEntityToDefinicion(entity);
    expect(definicion.validacion).toBeUndefined();
  });
});
