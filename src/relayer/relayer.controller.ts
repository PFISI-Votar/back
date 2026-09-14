import {
  Body,
  Controller,
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
import { IpRateLimitGuard } from '@/common/rate-limit/ip-rate-limit.guard';
import { RateLimit } from '@/common/rate-limit/rate-limit.decorator';
import { RateLimitTier } from '@/common/rate-limit/rate-limit-tier.enum';
import { RelayCastDto } from '@/relayer/dto/relay-cast.dto';
import {
  RelayAuthorizationResponseDto,
  RelayCastResponseDto,
} from '@/relayer/dto/relay-response.dto';
import { RelayerService } from '@/relayer/relayer.service';

@ApiTags('relayer')
@Controller('elecciones/:idEleccion/relayer')
export class RelayerController {
  constructor(private readonly relayerService: RelayerService) {}

  @Post('autorizacion')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @UseGuards(
    VoterJwtAuthGuard,
    RolesGuard,
    VoterElectionGuard,
    IpRateLimitGuard,
  )
  @Roles(JwtRole.VOTER)
  @RateLimit({
    tier: RateLimitTier.VOTE,
    bucket: 'relayer-autorizacion',
    message:
      'Demasiadas autorizaciones de relayer. Intente nuevamente en un minuto.',
  })
  @ApiOperation({
    summary:
      'Emitir capacidad de un solo uso para que el relayer pague el gas (VOTAR-497)',
  })
  @ApiParam({ name: 'idEleccion', type: Number })
  @ApiResponse({ status: 200, type: RelayAuthorizationResponseDto })
  @ApiResponse({ status: 401, description: 'Sesión de votante inválida' })
  @ApiResponse({ status: 403, description: 'No habilitado en el padrón' })
  emitirAutorizacion(
    @Param('idEleccion', ParseIntPipe) idEleccion: number,
    @Req() request: VoterAuthenticatedRequest,
  ): Promise<RelayAuthorizationResponseDto> {
    return this.relayerService.emitirAutorizacion(
      idEleccion,
      request.user.votanteHash,
    );
  }

  @Post('cast')
  @HttpCode(HttpStatus.OK)
  @UseGuards(IpRateLimitGuard)
  @RateLimit({
    tier: RateLimitTier.VOTE,
    bucket: 'relayer-cast',
    message: 'Demasiados envíos al relayer. Intente nuevamente en un minuto.',
  })
  @ApiOperation({
    summary:
      'Transmitir castSignedVote sin cookie de sesión. El gas lo paga el relayer (VOTAR-497).',
  })
  @ApiParam({ name: 'idEleccion', type: Number })
  @ApiResponse({ status: 200, type: RelayCastResponseDto })
  @ApiResponse({ status: 401, description: 'Capacidad inválida o consumida' })
  @ApiResponse({
    status: 422,
    description: 'El contrato rechazó la simulación',
  })
  transmitir(
    @Param('idEleccion', ParseIntPipe) idEleccion: number,
    @Body() body: RelayCastDto,
  ): Promise<RelayCastResponseDto> {
    return this.relayerService.transmitir(idEleccion, body);
  }
}
