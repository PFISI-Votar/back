import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Eleccion } from './entities/eleccion.entity';
import { CrearEleccionDto } from './dto/crear-eleccion.dto';
import { IEleccionController } from './interfaces/eleccion.controller.interface';
import { EleccionesService } from './eleccion.service';

@ApiTags('elecciones')
@Controller('elecciones')
export class EleccionesController implements IEleccionController {
  constructor(private readonly eleccionesService: EleccionesService) {}

  @Get()
  @ApiOperation({ summary: 'Listar todos los comicios' })
  @ApiResponse({ status: 200, description: 'OK', type: [Eleccion] })
  async listarElecciones(): Promise<Eleccion[]> {
    return this.eleccionesService.listarElecciones();
  }

  @Post()
  @ApiOperation({ summary: 'Crear un nuevo comicio en estado BORRADOR' })
  @ApiResponse({ status: 201, description: 'Comicio creado exitosamente', type: Eleccion })
  @ApiResponse({ status: 422, description: 'Inconsistencia temporal en las fechas' })
  @ApiResponse({ status: 400, description: 'Datos inválidos o campo mal formado' })
  async crearEleccion(@Body() dto: CrearEleccionDto): Promise<Eleccion> {
    return this.eleccionesService.crearEleccion(dto);
  }
}