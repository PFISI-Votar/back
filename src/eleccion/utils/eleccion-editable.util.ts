import { ConflictException } from '@nestjs/common';
import { EleccionEstado } from '@/eleccion/enums/eleccion-estado.enum';
import { Eleccion } from '@/eleccion/entities/eleccion.entity';

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

export const VISIBILIDAD_DASHBOARD_NO_EDITABLE_MESSAGE =
  'La visibilidad del dashboard público solo puede modificarse antes de abrir el comicio';

/**
 * VOTAR-459: a diferencia del resto de la configuración del comicio (solo
 * BORRADOR), la visibilidad del dashboard público también admite ediciones en
 * CONFIGURADA; queda congelada recién al abrir el comicio.
 */
export const assertVisibilidadDashboardEditable = (
  eleccion: Eleccion,
): void => {
  if (
    ![EleccionEstado.BORRADOR, EleccionEstado.CONFIGURADA].includes(
      eleccion.estado,
    )
  ) {
    throw new ConflictException(VISIBILIDAD_DASHBOARD_NO_EDITABLE_MESSAGE);
  }
};
