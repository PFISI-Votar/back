import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Categoria } from '@/eleccion/lista/entities/categoria.entity';
import { ActualizarCategoriaDto } from './dto/actualizar-categoria.dto';
import { CrearCategoriaDto } from './dto/crear-categoria.dto';
import { CategoriasService } from './categoria.service';
import { ICategoriaController } from './interfaces/categoria.controller.interface';

@ApiTags('categorias')
@Controller('elecciones/:idEleccion/categorias')
export class CategoriasController implements ICategoriaController {
  constructor(private readonly categoriasService: CategoriasService) {}

  @Post()
  @ApiOperation({ summary: 'Crear una categoría en un comicio en estado BORRADOR' })
  @ApiParam({ name: 'idEleccion', type: Number })
  @ApiResponse({ status: 201, type: Categoria })
  async crearCategoria(
    @Param('idEleccion', ParseIntPipe) idEleccion: number,
    @Body() dto: CrearCategoriaDto,
  ): Promise<Categoria> {
    return this.categoriasService.crearCategoria(idEleccion, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar categorías de un comicio' })
  @ApiParam({ name: 'idEleccion', type: Number })
  @ApiResponse({ status: 200, type: [Categoria] })
  async listarCategorias(
    @Param('idEleccion', ParseIntPipe) idEleccion: number,
  ): Promise<Categoria[]> {
    return this.categoriasService.listarCategorias(idEleccion);
  }

  @Patch(':idCategoria')
  @ApiOperation({ summary: 'Actualizar una categoría en un comicio BORRADOR' })
  @ApiParam({ name: 'idEleccion', type: Number })
  @ApiParam({ name: 'idCategoria', type: Number })
  @ApiResponse({ status: 200, type: Categoria })
  async actualizarCategoria(
    @Param('idEleccion', ParseIntPipe) idEleccion: number,
    @Param('idCategoria', ParseIntPipe) idCategoria: number,
    @Body() dto: ActualizarCategoriaDto,
  ): Promise<Categoria> {
    return this.categoriasService.actualizarCategoria(
      idEleccion,
      idCategoria,
      dto,
    );
  }

  @Delete(':idCategoria')
  @ApiOperation({ summary: 'Eliminar una categoría en un comicio BORRADOR' })
  @ApiParam({ name: 'idEleccion', type: Number })
  @ApiParam({ name: 'idCategoria', type: Number })
  @ApiResponse({ status: 204, description: 'Categoría eliminada' })
  async eliminarCategoria(
    @Param('idEleccion', ParseIntPipe) idEleccion: number,
    @Param('idCategoria', ParseIntPipe) idCategoria: number,
  ): Promise<void> {
    return this.categoriasService.eliminarCategoria(idEleccion, idCategoria);
  }
}
