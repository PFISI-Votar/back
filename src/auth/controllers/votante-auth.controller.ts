import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { GOOGLE_OAUTH_STATE_COOKIE_NAME } from '@/auth/constants/auth-cookie.constants';
import {
  VotanteAuthResponseDto,
  VotanteAuthUserDto,
} from '@/auth/dto/votante-auth-response.dto';
import { VotanteLoginDto } from '@/auth/dto/votante-login.dto';
import { AuthLockdownScope } from '@/auth/decorators/auth-lockdown-scope.decorator';
import { AuthLockdownGuard } from '@/auth/guards/auth-lockdown.guard';
import { VoterJwtAuthGuard } from '@/auth/guards/voter-jwt-auth.guard';
import type { VoterAuthenticatedRequest } from '@/auth/interfaces/voter-authenticated-request.interface';
import { VotanteAuthService } from '@/auth/services/votante-auth.service';
import { GoogleOidcService } from '@/auth/services/google-oidc.service';
import { assertVoterAuthenticatedUser } from '@/auth/strategies/voter-jwt.strategy';
import {
  clearVoterAccessCookie,
  clearGoogleOAuthStateCookie,
  setGoogleOAuthStateCookie,
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
    private readonly googleOidcService: GoogleOidcService,
    private readonly configService: ConfigService,
  ) {}

  @Get('google')
  @UseGuards(IpRateLimitGuard, AuthLockdownGuard)
  @AuthLockdownScope('TODOS')
  @RateLimit({ tier: RateLimitTier.AUTH, bucket: 'auth-votante-google' })
  @ApiOperation({ summary: 'Iniciar OAuth 2.0 / OIDC con Google' })
  async startGoogleLogin(
    @Query('idEleccion') rawIdEleccion: string,
    @Res() response: Response,
  ): Promise<void> {
    const idEleccion = Number(rawIdEleccion);
    if (!Number.isInteger(idEleccion) || idEleccion < 1) {
      throw new BadRequestException('idEleccion inválido');
    }
    await this.votanteAuthService.assertGoogleLoginAllowed(idEleccion);
    const { authorizationUrl, stateCookie } =
      this.googleOidcService.createAuthorizationRequest(idEleccion);
    setGoogleOAuthStateCookie(response, stateCookie, this.isProduction());
    response.redirect(authorizationUrl);
  }

  @Get('google/callback')
  @UseGuards(IpRateLimitGuard)
  @RateLimit({
    tier: RateLimitTier.AUTH,
    bucket: 'auth-votante-google-callback',
  })
  @ApiOperation({ summary: 'Callback OAuth 2.0 / OIDC de Google' })
  async finishGoogleLogin(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') oauthError: string | undefined,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const stateCookie = request.cookies?.[GOOGLE_OAUTH_STATE_COOKIE_NAME] as
      string | undefined;
    try {
      if (oauthError || !code || !state) {
        throw new BadRequestException('Autenticación cancelada');
      }
      const { identity, idEleccion } =
        await this.googleOidcService.authenticateCallback(
          code,
          state,
          stateCookie,
        );
      const { accessToken } = await this.votanteAuthService.loginWithGoogle(
        identity,
        idEleccion,
      );
      setVoterAccessTokenCookie(response, accessToken, {
        maxAgeSeconds: this.votanteAuthService.getVoterAccessTtlSeconds(),
        secure: this.isProduction(),
      });
      clearGoogleOAuthStateCookie(response, this.isProduction());
      response.redirect(this.buildFrontendVoterUrl(idEleccion));
    } catch {
      clearGoogleOAuthStateCookie(response, this.isProduction());
      response.redirect(this.buildFrontendVoterUrlFromState(stateCookie, true));
    }
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @UseGuards(IpRateLimitGuard, AuthLockdownGuard)
  @AuthLockdownScope('TODOS')
  @RateLimit({ tier: RateLimitTier.AUTH, bucket: 'auth-votante-login' })
  @ApiOperation({
    summary: 'Iniciar sesión de votante con credenciales institucionales',
  })
  @ApiBody({ type: VotanteLoginDto })
  @ApiResponse({
    status: 200,
    description:
      'Autenticación exitosa. JWT de votante en cookie HttpOnly, Secure y SameSite=Strict (30 min, sin refresh).',
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

  private buildFrontendVoterUrl(idEleccion: number, withError = false): string {
    const frontendUrl =
      this.configService.get<string>('FRONTEND_URL') ?? 'http://localhost:5173';
    const url = new URL(`/comicios/${idEleccion}/votar`, frontendUrl);
    if (withError) {
      url.searchParams.set('googleAuth', 'error');
    }
    return url.toString();
  }

  private buildFrontendVoterUrlFromState(
    stateCookie: string | undefined,
    withError: boolean,
  ): string {
    try {
      const parsed = JSON.parse(
        Buffer.from(stateCookie ?? '', 'base64url').toString('utf8'),
      ) as { idEleccion?: number };
      if (Number.isInteger(parsed.idEleccion) && (parsed.idEleccion ?? 0) > 0) {
        return this.buildFrontendVoterUrl(
          parsed.idEleccion as number,
          withError,
        );
      }
    } catch {
      // El estado inválido no se refleja en la URL; sólo elegimos un destino seguro.
    }
    const frontendUrl =
      this.configService.get<string>('FRONTEND_URL') ?? 'http://localhost:5173';
    const url = new URL('/', frontendUrl);
    if (withError) {
      url.searchParams.set('googleAuth', 'error');
    }
    return url.toString();
  }
}
