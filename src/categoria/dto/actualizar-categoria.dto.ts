import { PartialType } from '@nestjs/swagger';
import { CrearCategoriaDto } from './crear-categoria.dto';

export class ActualizarCategoriaDto extends PartialType(CrearCategoriaDto) {}
