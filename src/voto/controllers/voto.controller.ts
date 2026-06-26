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
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '@/auth/decorators/roles.decorator';
import { JwtRole } from '@/auth/enums/jwt-role.enum';
import { RolesGuard } from '@/auth/guards/roles.guard';
import { VoterElectionGuard } from '@/auth/guards/voter-election.guard';
import { VoterJwtAuthGuard } from '@/auth/guards/voter-jwt-auth.guard';
import type { VoterAuthenticatedRequest } from '@/auth/interfaces/voter-authenticated-request.interface';
import { BoletaDigitalResponseDto } from '@/voto/dto/boleta-digital-response.dto';
import { ConfirmarVotoDto } from '@/voto/dto/confirmar-voto.dto';
import { ConfirmarVotoResponseDto } from '@/voto/dto/confirmar-voto-response.dto';
import { VotoRateLimitGuard } from '@/voto/guards/voto-rate-limit.guard';
import { VotoService } from '@/voto/services/voto.service';

@ApiTags('voto')
@ApiBearerAuth()
@Controller('elecciones/:idEleccion')
@UseGuards(VoterJwtAuthGuard, RolesGuard, VoterElectionGuard)
@Roles(JwtRole.VOTER)
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
    @Req() request: VoterAuthenticatedRequest,
  ): Promise<BoletaDigitalResponseDto> {
    return this.votoService.obtenerBoletaDigital(
      idEleccion,
      request.user.votanteHash,
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
    @Req() request: VoterAuthenticatedRequest,
  ): Promise<ConfirmarVotoResponseDto> {
    return this.votoService.confirmarVoto(
      idEleccion,
      dto,
      request.user.votanteHash,
    );
  }
}
