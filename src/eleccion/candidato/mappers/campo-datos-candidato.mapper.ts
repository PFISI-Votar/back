import { TipoCampoCandidatoEnum } from '@/eleccion/candidato/enums/tipo-campo-candidato.enum';
import { CampoDatosCandidato } from '@/eleccion/candidato/entities/campo-datos-candidato.entity';
import {
  CampoCandidatoDefinicion,
  ValidacionCampoCandidato,
} from '@/eleccion/candidato/interfaces/campo-candidato-definicion.interface';

const buildValidacionFromEntity = (
  entity: CampoDatosCandidato,
): ValidacionCampoCandidato | undefined => {
  const validacion: ValidacionCampoCandidato = {};
  if (entity.minLength !== null) {
    validacion.minLength = entity.minLength;
  }
  if (entity.maxLength !== null) {
    validacion.maxLength = entity.maxLength;
  }
  if (entity.minValor !== null) {
    validacion.min = entity.minValor;
  }
  if (entity.maxValor !== null) {
    validacion.max = entity.maxValor;
  }
  if (entity.pattern !== null) {
    validacion.pattern = entity.pattern;
  }
  if (entity.patternMessage !== null) {
    validacion.patternMessage = entity.patternMessage;
  }
  return Object.keys(validacion).length > 0 ? validacion : undefined;
};

export const mapEntityToDefinicion = (
  entity: CampoDatosCandidato,
): CampoCandidatoDefinicion => {
  const definicion: CampoCandidatoDefinicion = {
    clave: entity.clave,
    etiqueta: entity.etiqueta,
    tipo: entity.tipo,
    obligatorio: entity.obligatorio,
    orden: entity.orden,
  };
  if (entity.ejemplo !== null) {
    definicion.ejemplo = entity.ejemplo;
  }
  if (entity.ayuda !== null) {
    definicion.ayuda = entity.ayuda;
  }
  const validacion = buildValidacionFromEntity(entity);
  if (validacion) {
    definicion.validacion = validacion;
  }
  return definicion;
};

export const mapDefinicionToEntity = (
  definicion: CampoCandidatoDefinicion,
): CampoDatosCandidato => {
  const entity = new CampoDatosCandidato();
  entity.clave = definicion.clave;
  entity.etiqueta = definicion.etiqueta;
  entity.tipo = definicion.tipo as TipoCampoCandidatoEnum;
  entity.obligatorio = definicion.obligatorio;
  entity.orden = definicion.orden;
  entity.ejemplo = definicion.ejemplo ?? null;
  entity.ayuda = definicion.ayuda ?? null;
  entity.minLength = definicion.validacion?.minLength ?? null;
  entity.maxLength = definicion.validacion?.maxLength ?? null;
  entity.minValor = definicion.validacion?.min ?? null;
  entity.maxValor = definicion.validacion?.max ?? null;
  entity.pattern = definicion.validacion?.pattern ?? null;
  entity.patternMessage = definicion.validacion?.patternMessage ?? null;
  return entity;
};

export const mapEntitiesToDefiniciones = (
  entities: CampoDatosCandidato[],
): CampoCandidatoDefinicion[] => {
  return [...entities]
    .sort((a, b) => a.orden - b.orden)
    .map((entity) => mapEntityToDefinicion(entity));
};
