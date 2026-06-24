import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { BoletaDigitalResponseDto } from '@/voto/dto/boleta-digital-response.dto';
import { ConfirmarVotoDto } from '@/voto/dto/confirmar-voto.dto';
import { ConfirmarVotoResponseDto } from '@/voto/dto/confirmar-voto-response.dto';
import {
  VotanteSessionGuard,
  VOTANTE_TOKEN_HEADER,
} from '@/voto/guards/votante-session.guard';
import type { VotanteRequest } from '@/voto/guards/votante-session.guard';
import { VotoRateLimitGuard } from '@/voto/guards/voto-rate-limit.guard';
import { VotoService } from '@/voto/services/voto.service';

@ApiTags('voto')
@ApiBearerAuth()
@ApiHeader({
  name: VOTANTE_TOKEN_HEADER,
  description: 'Token de sesión de votante. MVP: hash de hoja del padrón.',
  required: true,
})
@Controller('elecciones/:idEleccion')
@UseGuards(VotanteSessionGuard)
export class VotoController {
  constructor(private readonly votoService: VotoService) {}

  @Get('boleta-digital')
  @ApiOperation({ summary: 'Obtener Boleta Única Digital del comicio' })
  @ApiParam({ name: 'idEleccion', type: Number })
  @ApiResponse({ status: 200, type: BoletaDigitalResponseDto })
  @ApiResponse({ status: 401, description: 'Sesión de votante inválida' })
  @ApiResponse({ status: 403, description: 'Votante o comicio no habilitado' })
  @ApiResponse({ status: 404, description: 'Comicio o boleta no encontrada' })
  obtenerBoletaDigital(
    @Param('idEleccion', ParseIntPipe) idEleccion: number,
    @Req() request: VotanteRequest,
  ): Promise<BoletaDigitalResponseDto> {
    return this.votoService.obtenerBoletaDigital(
      idEleccion,
      request.votanteHash,
    );
  }

  @Post('votos/confirmar')
  @UseGuards(VotoRateLimitGuard)
  @ApiOperation({ summary: 'Confirmar voto emitido desde la BUD' })
  @ApiParam({ name: 'idEleccion', type: Number })
  @ApiResponse({ status: 201, type: ConfirmarVotoResponseDto })
  @ApiResponse({ status: 400, description: 'Payload inválido' })
  @ApiResponse({ status: 401, description: 'Sesión de votante inválida' })
  @ApiResponse({ status: 403, description: 'Votante o comicio no habilitado' })
  @ApiResponse({
    status: 409,
    description: 'Voto duplicado o idempotencia inválida',
  })
  @ApiResponse({ status: 422, description: 'Selección no confirmable' })
  confirmarVoto(
    @Param('idEleccion', ParseIntPipe) idEleccion: number,
    @Body() dto: ConfirmarVotoDto,
    @Req() request: VotanteRequest,
  ): Promise<ConfirmarVotoResponseDto> {
    return this.votoService.confirmarVoto(idEleccion, dto, request.votanteHash);
  }
}
