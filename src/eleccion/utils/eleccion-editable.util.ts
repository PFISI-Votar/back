import { ConflictException } from '@nestjs/common';
import { EleccionEstado } from '../enums/eleccion-estado.enum';
import { Eleccion } from '../entities/eleccion.entity';

export const OFERTA_OFICIALIZADA_MESSAGE =
  'La oferta electoral está oficializada y no admite modificaciones';

export const assertEleccionEditable = (eleccion: Eleccion): void => {
  if (eleccion.estado !== EleccionEstado.BORRADOR) {
    throw new ConflictException(OFERTA_OFICIALIZADA_MESSAGE);
  }
};

export const isEleccionOficializada = (eleccion: Eleccion): boolean => {
  return eleccion.estado !== EleccionEstado.BORRADOR;
};
