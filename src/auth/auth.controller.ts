import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { REFRESH_COOKIE_NAME } from '@/auth/constants/auth-cookie.constants';
import { AdminAuth } from '@/auth/decorators/admin-auth.decorator';
import { LoginDto } from '@/auth/dto/login.dto';
import { AuthResponseDto, AuthUserDto } from '@/auth/dto/auth-response.dto';
import {
  ResetTwoFactorDto,
  TwoFactorStatusDto,
  VerifyTwoFactorDto,
} from '@/auth/dto/two-factor.dto';
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from '@/auth/interfaces/authenticated-request.interface';
import { AuthService } from '@/auth/services/auth.service';
import { RefreshTokenService } from '@/auth/services/refresh-token.service';
import { assertAuthenticatedUser } from '@/auth/strategies/jwt.strategy';
import {
  clearAuthCookies,
  setAccessTokenCookie,
  setRefreshTokenCookie,
} from '@/auth/utils/auth-cookie.util';
import { parseDurationToSeconds } from '@/auth/utils/parse-duration.util';
import { IpRateLimitGuard } from '@/common/rate-limit/ip-rate-limit.guard';
import { RateLimit } from '@/common/rate-limit/rate-limit.decorator';
import { RateLimitTier } from '@/common/rate-limit/rate-limit-tier.enum';
import { resolveClientIp } from '@/common/utils/resolve-client-ip.util';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly refreshTokenService: RefreshTokenService,
    private readonly configService: ConfigService,
  ) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @UseGuards(IpRateLimitGuard)
  @RateLimit({ tier: RateLimitTier.AUTH, bucket: 'auth-admin-login' })
  @ApiOperation({
    summary: 'Iniciar sesión con credenciales de Autogestión UTN',
    description:
      'Si la cuenta es autoridad electoral, puede devolver un desafío 2FA (setup o verificación) en lugar de cookies de sesión.',
  })
  @ApiBody({ type: LoginDto })
  @ApiResponse({
    status: 200,
    description:
      'Autenticación exitosa o desafío 2FA pendiente. Access y refresh token en cookies HttpOnly solo si la sesión quedó completa.',
    type: AuthResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Credenciales inválidas' })
  @ApiResponse({ status: 429, description: 'Rate limit excedido' })
  async login(
    @Body() dto: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResponseDto> {
    const result = await this.authService.login(dto, {
      ipOrigen: this.resolveClientIp(request),
    });
    if (result.kind === 'two_factor') {
      return { twoFactor: result.twoFactor };
    }
    this.attachSessionCookies(
      response,
      result.session.response.accessToken,
      result.session.refreshToken,
    );
    return { user: result.session.response.user };
  }

  @Post('2fa/verify')
  @HttpCode(HttpStatus.OK)
  @UseGuards(IpRateLimitGuard)
  @RateLimit({ tier: RateLimitTier.AUTH, bucket: 'auth-admin-2fa-verify' })
  @ApiOperation({
    summary: 'Completar login admin verificando el código TOTP',
  })
  @ApiBody({ type: VerifyTwoFactorDto })
  @ApiResponse({
    status: 200,
    description: '2FA válido; cookies de sesión emitidas',
    type: AuthResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Código o desafío inválido' })
  @ApiResponse({ status: 429, description: 'Rate limit excedido' })
  async verifyTwoFactor(
    @Body() dto: VerifyTwoFactorDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResponseDto> {
    const { response: authResponse, refreshToken } =
      await this.authService.verifyTwoFactor(dto.challengeToken, dto.code, {
        ipOrigen: this.resolveClientIp(request),
      });
    this.attachSessionCookies(response, authResponse.accessToken, refreshToken);
    return { user: authResponse.user };
  }

  @Get('2fa/status')
  @AdminAuth()
  @ApiOperation({ summary: 'Estado del setup 2FA de la autoridad autenticada' })
  @ApiResponse({ status: 200, type: TwoFactorStatusDto })
  async getTwoFactorStatus(
    @Req() request: AuthenticatedRequest,
  ): Promise<TwoFactorStatusDto> {
    const user = assertAuthenticatedUser(request.user);
    return this.authService.getTwoFactorStatus(user);
  }

  @Post('2fa/reset')
  @HttpCode(HttpStatus.NO_CONTENT)
  @AdminAuth()
  @ApiOperation({
    summary:
      'Invalidar el setup 2FA tras confirmar la contraseña institucional',
  })
  @ApiBody({ type: ResetTwoFactorDto })
  @ApiResponse({ status: 204, description: 'Setup 2FA invalidado' })
  @ApiResponse({ status: 401, description: 'Contraseña inválida' })
  async resetTwoFactor(
    @Body() dto: ResetTwoFactorDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<void> {
    const user = assertAuthenticatedUser(request.user);
    await this.authService.resetTwoFactor(user, dto.password);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @UseGuards(IpRateLimitGuard)
  @RateLimit({ tier: RateLimitTier.AUTH, bucket: 'auth-admin-refresh' })
  @ApiOperation({
    summary: 'Renovar sesión usando la cookie de refresh HttpOnly',
  })
  @ApiResponse({
    status: 200,
    description: 'Sesión renovada; cookies de access y refresh rotadas',
    type: AuthResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Sesión de refresco inválida' })
  @ApiResponse({ status: 429, description: 'Rate limit excedido' })
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResponseDto> {
    const refreshToken = this.extractRefreshToken(request);
    const { response: authResponse, refreshToken: nextRefreshToken } =
      await this.authService.refreshSession(refreshToken);
    this.attachSessionCookies(
      response,
      authResponse.accessToken,
      nextRefreshToken,
    );
    return { user: authResponse.user };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Obtener el usuario autenticado desde la cookie de access',
  })
  @ApiResponse({ status: 200, type: AuthUserDto })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  getCurrentUser(@Req() request: AuthenticatedRequest): AuthUserDto {
    const user = assertAuthenticatedUser(request.user);
    return {
      sub: user.sub,
      role: user.role,
      email: user.email,
      name: user.name,
    };
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Cerrar sesión y revocar refresh token' })
  @ApiResponse({ status: 204, description: 'Sesión cerrada' })
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    const refreshToken = request.cookies?.[REFRESH_COOKIE_NAME] as
      | string
      | undefined;
    await this.authService.logout(refreshToken);
    clearAuthCookies(response, this.isProduction());
  }

  private extractRefreshToken(request: Request): string {
    const refreshToken = request.cookies?.[REFRESH_COOKIE_NAME] as
      | string
      | undefined;
    if (!refreshToken) {
      throw new UnauthorizedException('Sesión de refresco inválida');
    }
    return refreshToken;
  }

  private attachSessionCookies(
    response: Response,
    accessToken: string,
    refreshToken: string,
  ): void {
    const secure = this.isProduction();
    setAccessTokenCookie(response, accessToken, {
      maxAgeSeconds: this.getAccessTtlSeconds(),
      secure,
    });
    setRefreshTokenCookie(response, refreshToken, {
      maxAgeSeconds: this.refreshTokenService.getRefreshTtlSeconds(),
      secure,
    });
  }

  private getAccessTtlSeconds(): number {
    return parseDurationToSeconds(
      this.configService.get<string>('JWT_ACCESS_EXPIRES_IN') ??
        this.configService.get<string>('JWT_EXPIRES_IN') ??
        '15m',
    );
  }

  private isProduction(): boolean {
    return this.configService.get<boolean>('DEVELOPMENT') === false;
  }

  private resolveClientIp(request: Request): string {
    return resolveClientIp(request);
  }
}
