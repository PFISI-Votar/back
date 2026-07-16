import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
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
import { PadronService } from '@/padron/padron.service';
import { BoletaDigitalResponseDto } from '@/voto/dto/boleta-digital-response.dto';
import { EstadoRevotoResponseDto } from '@/voto/dto/estado-revoto-response.dto';
import { VoterMerkleProofResponseDto } from '@/voto/dto/voter-merkle-proof-response.dto';
import { MerkleProofRateLimitGuard } from '@/voto/guards/merkle-proof-rate-limit.guard';
import { RevotePolicyService } from '@/voto/services/revote-policy.service';
import { VotoService } from '@/voto/services/voto.service';

@ApiTags('voto')
@ApiBearerAuth()
@Controller('elecciones/:idEleccion')
@UseGuards(VoterJwtAuthGuard, RolesGuard, VoterElectionGuard)
@Roles(JwtRole.VOTER)
export class VotoController {
  constructor(
    private readonly votoService: VotoService,
    private readonly padronService: PadronService,
    private readonly revotePolicyService: RevotePolicyService,
  ) {}

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

  @Get('merkle-proof')
  @UseGuards(MerkleProofRateLimitGuard)
  @ApiOperation({
    summary: 'Solicitar Merkle Proof autenticada del padrón (VOTAR-354)',
  })
  @ApiParam({ name: 'idEleccion', type: Number })
  @ApiResponse({ status: 200, type: VoterMerkleProofResponseDto })
  @ApiResponse({ status: 401, description: 'JWT inválido o expirado' })
  @ApiResponse({ status: 403, description: 'No habilitado en el padrón' })
  @ApiResponse({ status: 404, description: 'Árbol Merkle no consolidado' })
  @ApiResponse({ status: 429, description: 'Rate limit excedido' })
  solicitarMerkleProof(
    @Param('idEleccion', ParseIntPipe) idEleccion: number,
    @Req() request: VoterAuthenticatedRequest,
  ): Promise<VoterMerkleProofResponseDto> {
    return this.padronService.solicitarMerkleProofAutenticada(
      idEleccion,
      request.user.votanteHash,
    );
  }

  @Get('estado-revoto')
  @ApiOperation({
    summary:
      'Consultar intentos de sufragio restantes (revotePolicyService — VOTAR-328)',
  })
  @ApiParam({ name: 'idEleccion', type: Number })
  @ApiResponse({ status: 200, type: EstadoRevotoResponseDto })
  @ApiResponse({ status: 401, description: 'Sesión de votante inválida' })
  @ApiResponse({ status: 403, description: 'Votante o comicio no habilitado' })
  @ApiResponse({ status: 404, description: 'Comicio no encontrado' })
  obtenerEstadoRevoto(
    @Param('idEleccion', ParseIntPipe) idEleccion: number,
    @Req() request: VoterAuthenticatedRequest,
  ): Promise<EstadoRevotoResponseDto> {
    return this.revotePolicyService.obtenerEstado(
      idEleccion,
      request.user.votanteHash,
    );
  }

  @Post('estado-revoto/consumo')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Registrar consumo de un intento tras cast on-chain exitoso (VOTAR-328)',
  })
  @ApiParam({ name: 'idEleccion', type: Number })
  @ApiResponse({ status: 200, type: EstadoRevotoResponseDto })
  @ApiResponse({ status: 401, description: 'Sesión de votante inválida' })
  @ApiResponse({ status: 403, description: 'Comicio no apto' })
  @ApiResponse({ status: 404, description: 'Comicio no encontrado' })
  registrarConsumoIntento(
    @Param('idEleccion', ParseIntPipe) idEleccion: number,
    @Req() request: VoterAuthenticatedRequest,
  ): Promise<EstadoRevotoResponseDto> {
    return this.revotePolicyService.registrarConsumo(
      idEleccion,
      request.user.votanteHash,
    );
  }
}
