import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Put,
  Req,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AdminAuth } from '@/auth/decorators/admin-auth.decorator';
import type { AuthenticatedRequest } from '@/auth/interfaces/authenticated-request.interface';
import { assertAuthenticatedUser } from '@/auth/strategies/jwt.strategy';
import {
  ConfiguracionRevotoResponseDto,
  GuardarConfiguracionRevotoDto,
} from '@/eleccion/configuracion-comicio/dto/configuracion-revoto.dto';
import {
  ConfiguracionVotoNuloResponseDto,
  GuardarConfiguracionVotoNuloDto,
} from '@/eleccion/configuracion-comicio/dto/configuracion-voto-nulo.dto';
import {
  GuardarVisibilidadDashboardDto,
  VisibilidadDashboardResponseDto,
} from '@/eleccion/configuracion-comicio/dto/visibilidad-dashboard.dto';
import { ConfiguracionComicioService } from '@/eleccion/configuracion-comicio/services/configuracion-comicio.service';

@ApiTags('configuracion-comicio')
@AdminAuth()
@Controller()
export class ConfiguracionComicioController {
  constructor(
    private readonly configuracionComicioService: ConfiguracionComicioService,
  ) {}

  @Get('elecciones/:idEleccion/configuracion-revoto')
  @ApiOperation({
    summary: 'Obtener configuración de re-voto del comicio (VOTAR-323)',
  })
  @ApiParam({ name: 'idEleccion', type: Number })
  @ApiResponse({ status: 200, type: ConfiguracionRevotoResponseDto })
  @ApiResponse({ status: 404, description: 'Not Found' })
  async obtenerConfiguracionRevoto(
    @Param('idEleccion', ParseIntPipe) idEleccion: number,
  ): Promise<ConfiguracionRevotoResponseDto> {
    return this.configuracionComicioService.obtenerConfiguracionRevoto(
      idEleccion,
    );
  }

  @Put('elecciones/:idEleccion/configuracion-revoto')
  @ApiOperation({
    summary: 'Guardar configuración de re-voto del comicio (VOTAR-323)',
  })
  @ApiParam({ name: 'idEleccion', type: Number })
  @ApiResponse({ status: 200, type: ConfiguracionRevotoResponseDto })
  @ApiResponse({ status: 404, description: 'Not Found' })
  @ApiResponse({
    status: 409,
    description: 'Conflict — comicio no editable (no BORRADOR)',
  })
  @ApiResponse({
    status: 422,
    description:
      'Unprocessable Entity — payload inconsistente (p. ej. maxVotos > 1 con re-voto off, fuera del rango [1, 10], o minIntervaloSegundos > 0 con re-voto off, o fuera del rango [0, 3600])',
  })
  async guardarConfiguracionRevoto(
    @Param('idEleccion', ParseIntPipe) idEleccion: number,
    @Body() dto: GuardarConfiguracionRevotoDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<ConfiguracionRevotoResponseDto> {
    const user = assertAuthenticatedUser(req.user);
    return this.configuracionComicioService.guardarConfiguracionRevoto(
      idEleccion,
      dto,
      {
        actorId: user.sub,
        ipOrigen: this.resolveClientIp(req),
      },
    );
  }

  @Get('elecciones/:idEleccion/configuracion-voto-nulo')
  @ApiOperation({
    summary: 'Obtener configuración de voto nulo del comicio (VOTAR-443)',
  })
  @ApiParam({ name: 'idEleccion', type: Number })
  @ApiResponse({ status: 200, type: ConfiguracionVotoNuloResponseDto })
  @ApiResponse({ status: 404, description: 'Not Found' })
  async obtenerConfiguracionVotoNulo(
    @Param('idEleccion', ParseIntPipe) idEleccion: number,
  ): Promise<ConfiguracionVotoNuloResponseDto> {
    return this.configuracionComicioService.obtenerConfiguracionVotoNulo(
      idEleccion,
    );
  }

  @Put('elecciones/:idEleccion/configuracion-voto-nulo')
  @ApiOperation({
    summary: 'Guardar configuración de voto nulo del comicio (VOTAR-443)',
  })
  @ApiParam({ name: 'idEleccion', type: Number })
  @ApiResponse({ status: 200, type: ConfiguracionVotoNuloResponseDto })
  @ApiResponse({ status: 404, description: 'Not Found' })
  @ApiResponse({
    status: 409,
    description: 'Conflict — comicio no editable (no BORRADOR)',
  })
  async guardarConfiguracionVotoNulo(
    @Param('idEleccion', ParseIntPipe) idEleccion: number,
    @Body() dto: GuardarConfiguracionVotoNuloDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<ConfiguracionVotoNuloResponseDto> {
    const user = assertAuthenticatedUser(req.user);
    return this.configuracionComicioService.guardarConfiguracionVotoNulo(
      idEleccion,
      dto,
      {
        actorId: user.sub,
        ipOrigen: this.resolveClientIp(req),
      },
    );
  }

  @Get('elecciones/:idEleccion/visibilidad-dashboard')
  @ApiOperation({
    summary:
      'Obtener visibilidad de las solapas del dashboard público (VOTAR-459)',
  })
  @ApiParam({ name: 'idEleccion', type: Number })
  @ApiResponse({ status: 200, type: VisibilidadDashboardResponseDto })
  @ApiResponse({ status: 404, description: 'Not Found' })
  async obtenerVisibilidadDashboard(
    @Param('idEleccion', ParseIntPipe) idEleccion: number,
  ): Promise<VisibilidadDashboardResponseDto> {
    return this.configuracionComicioService.obtenerVisibilidadDashboard(
      idEleccion,
    );
  }

  @Put('elecciones/:idEleccion/visibilidad-dashboard')
  @ApiOperation({
    summary:
      'Guardar visibilidad de las solapas del dashboard público (VOTAR-459)',
  })
  @ApiParam({ name: 'idEleccion', type: Number })
  @ApiResponse({ status: 200, type: VisibilidadDashboardResponseDto })
  @ApiResponse({ status: 404, description: 'Not Found' })
  @ApiResponse({
    status: 409,
    description: 'Conflict — comicio no editable (no BORRADOR ni CONFIGURADA)',
  })
  async guardarVisibilidadDashboard(
    @Param('idEleccion', ParseIntPipe) idEleccion: number,
    @Body() dto: GuardarVisibilidadDashboardDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<VisibilidadDashboardResponseDto> {
    const user = assertAuthenticatedUser(req.user);
    return this.configuracionComicioService.guardarVisibilidadDashboard(
      idEleccion,
      dto,
      {
        actorId: user.sub,
        ipOrigen: this.resolveClientIp(req),
      },
    );
  }

  private resolveClientIp(request: AuthenticatedRequest): string {
    const forwarded = request.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.length > 0) {
      return forwarded.split(',')[0]?.trim() ?? 'unknown';
    }
    return request.ip ?? 'unknown';
  }
}
