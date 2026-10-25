import { Eleccion } from '@/eleccion/entities/eleccion.entity';
import { EleccionResponseDto } from '@/eleccion/dto/eleccion-response.dto';
import { Categoria } from '@/eleccion/lista/entities/categoria.entity';
import { mapCategoriaToRolResponse } from '@/eleccion/lista/mappers/categoria.mapper';

export const mapEleccionToResponseDto = (
  eleccion: Eleccion,
  categorias: Categoria[],
  metodosAutenticacion: EleccionResponseDto['metodosAutenticacion'],
): EleccionResponseDto => ({
  idEleccion: eleccion.idEleccion,
  nombre: eleccion.nombre,
  descripcion: eleccion.descripcion,
  observacionLogin: eleccion.observacionLogin,
  fechaInicio: eleccion.fechaInicio,
  fechaFin: eleccion.fechaFin,
  estado: eleccion.estado,
  pausada: eleccion.pausada,
  pausadaEn: eleccion.pausadaEn,
  tipoVotacion: eleccion.tipoVotacion,
  roles: categorias
    .sort((a, b) => a.orden - b.orden)
    .map(mapCategoriaToRolResponse),
  metodosAutenticacion,
});
