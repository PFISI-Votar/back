import { DeepPartial } from 'typeorm';
import { RolCandidatoDto } from '@/eleccion/lista/dto/rol-candidato.dto';
import { Categoria } from '@/eleccion/lista/entities/categoria.entity';
import { RolCandidatoResponseDto } from '@/eleccion/lista/dto/rol-candidato.dto';

export const mapRolDtoToCategoriaEntity = (
  rol: RolCandidatoDto,
  idBoleta: number,
  orden: number,
): DeepPartial<Categoria> => ({
  idBoleta,
  nombre: rol.nombre,
  descripcion: null,
  cantidadCargos: rol.maximoPostulantes,
  orden,
});

export const mapCategoriaToRolResponse = (
  categoria: Categoria,
): RolCandidatoResponseDto => ({
  idCategoria: categoria.idCategoria,
  nombre: categoria.nombre,
  maximoPostulantes: categoria.cantidadCargos,
  orden: categoria.orden,
});
