import { Body, Controller, Get, Param, ParseIntPipe, Post } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Eleccion } from '@/eleccion/entities/eleccion.entity';
import { CrearEleccionDto } from '@/eleccion/dto/crear-eleccion.dto';
import { IEleccionController } from '@/eleccion/interfaces/eleccion.controller.interface';
import { EleccionesService } from '@/eleccion/services/eleccion.service';

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

  @Get(':idEleccion')
  @ApiOperation({ summary: 'Obtener comicio por ID' })
  @ApiParam({ name: 'idEleccion', type: Number })
  @ApiResponse({ status: 200, description: 'OK', type: Eleccion })
  @ApiResponse({ status: 404, description: 'Not Found' })
  async obtenerEleccion(
    @Param('idEleccion', ParseIntPipe) idEleccion: number,
  ): Promise<Eleccion> {
    return this.eleccionesService.obtenerPorId(idEleccion);
  }

  @Post()
  @ApiOperation({ summary: 'Crear un nuevo comicio en estado BORRADOR' })
  @ApiResponse({
    status: 201,
    description: 'Comicio creado exitosamente',
    type: Eleccion,
  })
  @ApiResponse({
    status: 422,
    description: 'Inconsistencia temporal en las fechas',
  })
  @ApiResponse({
    status: 400,
    description: 'Datos inválidos o campo mal formado',
  })
  async crearEleccion(@Body() dto: CrearEleccionDto): Promise<Eleccion> {
    return this.eleccionesService.crearEleccion(dto);
  }
}
