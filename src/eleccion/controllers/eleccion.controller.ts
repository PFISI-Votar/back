import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AdminAuth } from '@/auth/decorators/admin-auth.decorator';
import { ActualizarEleccionDto } from '@/eleccion/dto/actualizar-eleccion.dto';
import { CrearEleccionDto } from '@/eleccion/dto/crear-eleccion.dto';
import { EleccionResponseDto } from '@/eleccion/dto/eleccion-response.dto';
import { AbrirEleccionResponseDto } from '@/eleccion/dto/abrir-eleccion-response.dto';
import { IEleccionController } from '@/eleccion/interfaces/eleccion.controller.interface';
import { EleccionesService } from '@/eleccion/services/eleccion.service';
import { AperturaComicioService } from '@/eleccion/services/apertura-comicio.service';
import type { AuthenticatedRequest } from '@/auth/interfaces/authenticated-request.interface';
import { assertAuthenticatedUser } from '@/auth/strategies/jwt.strategy';

@ApiTags('elecciones')
@AdminAuth()
@Controller('elecciones')
export class EleccionesController implements IEleccionController {
  constructor(
    private readonly eleccionesService: EleccionesService,
    private readonly aperturaComicioService: AperturaComicioService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Listar todos los comicios' })
  @ApiResponse({ status: 200, description: 'OK', type: [EleccionResponseDto] })
  async listarElecciones(): Promise<EleccionResponseDto[]> {
    return this.eleccionesService.listarElecciones();
  }

  @Get(':idEleccion')
  @ApiOperation({ summary: 'Obtener comicio por ID' })
  @ApiParam({ name: 'idEleccion', type: Number })
  @ApiResponse({ status: 200, description: 'OK', type: EleccionResponseDto })
  @ApiResponse({ status: 404, description: 'Not Found' })
  async obtenerEleccion(
    @Param('idEleccion', ParseIntPipe) idEleccion: number,
  ): Promise<EleccionResponseDto> {
    return this.eleccionesService.obtenerPorId(idEleccion);
  }

  @Post()
  @ApiOperation({ summary: 'Crear un nuevo comicio en estado BORRADOR' })
  @ApiResponse({
    status: 201,
    description: 'Comicio creado exitosamente',
    type: EleccionResponseDto,
  })
  @ApiResponse({
    status: 422,
    description:
      'Validación de fechas (pasado u orden), roles o métodos de autenticación',
  })
  @ApiResponse({
    status: 400,
    description: 'Datos inválidos o campo mal formado',
  })
  async crearEleccion(
    @Body() dto: CrearEleccionDto,
  ): Promise<EleccionResponseDto> {
    return this.eleccionesService.crearEleccion(dto);
  }

  @Patch(':idEleccion')
  @ApiOperation({ summary: 'Actualizar comicio en estado BORRADOR' })
  @ApiParam({ name: 'idEleccion', type: Number })
  @ApiResponse({ status: 200, description: 'OK', type: EleccionResponseDto })
  @ApiResponse({ status: 404, description: 'Not Found' })
  @ApiResponse({ status: 409, description: 'Comicio no editable' })
  @ApiResponse({ status: 422, description: 'Validación fallida' })
  async actualizarEleccion(
    @Param('idEleccion', ParseIntPipe) idEleccion: number,
    @Body() dto: ActualizarEleccionDto,
  ): Promise<EleccionResponseDto> {
    return this.eleccionesService.actualizarEleccion(idEleccion, dto);
  }

  @Delete(':idEleccion')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar comicio en estado BORRADOR' })
  @ApiParam({ name: 'idEleccion', type: Number })
  @ApiResponse({ status: 204, description: 'Eliminado' })
  @ApiResponse({ status: 404, description: 'Not Found' })
  @ApiResponse({ status: 409, description: 'Comicio no editable' })
  async eliminarEleccion(
    @Param('idEleccion', ParseIntPipe) idEleccion: number,
  ): Promise<void> {
    return this.eleccionesService.eliminarEleccion(idEleccion);
  }

  @Post(':idEleccion/abrir')
  @ApiOperation({ summary: 'Abrir comicio de forma manual' })
  @ApiParam({ name: 'idEleccion', type: Number })
  @ApiResponse({
    status: 200,
    description: 'Comicio abierto exitosamente',
    type: AbrirEleccionResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Elección no encontrada' })
  @ApiResponse({
    status: 412,
    description:
      'Fallo de precondición: Raíz de Merkle no publicada o no verificada on-chain',
  })
  @ApiResponse({
    status: 422,
    description: 'El comicio no está en estado CONFIGURADA',
  })
  async abrirComicio(
    @Param('idEleccion', ParseIntPipe) idEleccion: number,
    @Req() request: AuthenticatedRequest,
  ): Promise<AbrirEleccionResponseDto> {
    const user = assertAuthenticatedUser(request.user);
    const ipOrigen = request.ip ?? request.socket.remoteAddress;

    return this.aperturaComicioService.abrirManual(
      idEleccion,
      user.sub,
      ipOrigen,
    );
  }
}
