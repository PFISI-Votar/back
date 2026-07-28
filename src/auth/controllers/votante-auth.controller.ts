import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import {
  VotanteAuthResponseDto,
  VotanteAuthUserDto,
} from '@/auth/dto/votante-auth-response.dto';
import { VotanteLoginDto } from '@/auth/dto/votante-login.dto';
import { VoterJwtAuthGuard } from '@/auth/guards/voter-jwt-auth.guard';
import type { VoterAuthenticatedRequest } from '@/auth/interfaces/voter-authenticated-request.interface';
import { VotanteAuthService } from '@/auth/services/votante-auth.service';
import { assertVoterAuthenticatedUser } from '@/auth/strategies/voter-jwt.strategy';
import {
  clearVoterAccessCookie,
  setVoterAccessTokenCookie,
} from '@/auth/utils/auth-cookie.util';
import { IpRateLimitGuard } from '@/common/rate-limit/ip-rate-limit.guard';
import { RateLimit } from '@/common/rate-limit/rate-limit.decorator';
import { RateLimitTier } from '@/common/rate-limit/rate-limit-tier.enum';

@ApiTags('auth-votante')
@Controller('auth/votante')
export class VotanteAuthController {
  constructor(
    private readonly votanteAuthService: VotanteAuthService,
    private readonly configService: ConfigService,
  ) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @UseGuards(IpRateLimitGuard)
  @RateLimit({ tier: RateLimitTier.AUTH, bucket: 'auth-votante-login' })
  @ApiOperation({
    summary: 'Iniciar sesión de votante con credenciales institucionales',
  })
  @ApiBody({ type: VotanteLoginDto })
  @ApiResponse({
    status: 200,
    description:
      'Autenticación exitosa. JWT de votante en cookie HttpOnly (30 min, sin refresh).',
    type: VotanteAuthResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Credenciales inválidas' })
  @ApiResponse({ status: 429, description: 'Rate limit excedido' })
  async login(
    @Body() dto: VotanteLoginDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<VotanteAuthResponseDto> {
    const { accessToken, user } = await this.votanteAuthService.login(dto);
    setVoterAccessTokenCookie(response, accessToken, {
      maxAgeSeconds: this.votanteAuthService.getVoterAccessTtlSeconds(),
      secure: this.isProduction(),
    });
    return { user };
  }

  @Get('me')
  @UseGuards(VoterJwtAuthGuard)
  @ApiOperation({
    summary: 'Obtener el votante autenticado desde la cookie de access',
  })
  @ApiResponse({ status: 200, type: VotanteAuthUserDto })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  getCurrentVotante(
    @Req() request: VoterAuthenticatedRequest,
  ): VotanteAuthUserDto {
    const user = assertVoterAuthenticatedUser(request.user);
    return this.votanteAuthService.toAuthUser(user);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Cerrar sesión de votante y limpiar cookie' })
  @ApiResponse({ status: 204, description: 'Sesión de votante cerrada' })
  logout(@Res({ passthrough: true }) response: Response): void {
    clearVoterAccessCookie(response, this.isProduction());
  }

  private isProduction(): boolean {
    return this.configService.get<boolean>('DEVELOPMENT') === false;
  }
}
