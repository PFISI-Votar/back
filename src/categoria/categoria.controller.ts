import { Body, Controller, Get, Param, ParseIntPipe, Post } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Categoria } from '@/eleccion/lista/entities/categoria.entity';
import { CrearCategoriaDto } from './dto/crear-categoria.dto';
import { CategoriasService } from './categoria.service';
import { ICategoriaController } from './interfaces/categoria.controller.interface';

@ApiTags('categorias')
@Controller('elecciones/:idEleccion/categorias')
export class CategoriasController implements ICategoriaController {
  constructor(private readonly categoriasService: CategoriasService) {}

  @Post()
  @ApiOperation({
    summary: 'Crear una categoría en un comicio en estado BORRADOR',
    description:
      'Registra una nueva categoría electoral (ej: "Presidente", "Vocales") dentro de un comicio. ' +
      'Solo es posible mientras el comicio se encuentre en estado BORRADOR. ' +
      'El nombre no puede estar vacío, superar los 100 caracteres ni contener caracteres especiales de escape.',
  })
  @ApiParam({ name: 'idEleccion', type: Number, description: 'ID de la elección' })
  @ApiResponse({
    status: 201,
    description: 'Categoría creada exitosamente.',
    type: Categoria,
  })
  @ApiResponse({
    status: 400,
    description: 'Datos inválidos: nombre vacío, excede 100 caracteres o contiene caracteres especiales.',
  })
  @ApiResponse({
    status: 404,
    description: 'La elección especificada no existe.',
  })
  @ApiResponse({
    status: 422,
    description: 'El comicio ya fue oficializado; no se pueden agregar categorías.',
  })
  async crearCategoria(
    @Param('idEleccion', ParseIntPipe) idEleccion: number,
    @Body() dto: CrearCategoriaDto,
  ): Promise<Categoria> {
    return this.categoriasService.crearCategoria(idEleccion, dto);
  }

  @Get()
  @ApiOperation({
    summary: 'Listar categorías de un comicio',
    description: 'Retorna todas las categorías registradas en la elección, ordenadas por campo `orden` ASC.',
  })
  @ApiParam({ name: 'idEleccion', type: Number, description: 'ID de la elección' })
  @ApiResponse({
    status: 200,
    description: 'Lista de categorías de la elección.',
    type: [Categoria],
  })
  @ApiResponse({
    status: 404,
    description: 'La elección especificada no existe.',
  })
  async listarCategorias(
    @Param('idEleccion', ParseIntPipe) idEleccion: number,
  ): Promise<Categoria[]> {
    return this.categoriasService.listarCategorias(idEleccion);
  }
}