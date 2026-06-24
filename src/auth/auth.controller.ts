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
import { AuthResponseDto, AuthUserDto } from '@/auth/dto/auth-response.dto';
import { LoginDto } from '@/auth/dto/login.dto';
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
  @ApiOperation({
    summary: 'Iniciar sesión con credenciales de Autogestión UTN',
  })
  @ApiBody({ type: LoginDto })
  @ApiResponse({
    status: 200,
    description:
      'Autenticación exitosa. Access y refresh token en cookies HttpOnly.',
    type: AuthResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Credenciales inválidas' })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResponseDto> {
    const { response: authResponse, refreshToken } =
      await this.authService.login(dto);
    this.attachSessionCookies(response, authResponse.accessToken, refreshToken);
    return { user: authResponse.user };
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Renovar sesión usando la cookie de refresh HttpOnly',
  })
  @ApiResponse({
    status: 200,
    description: 'Sesión renovada; cookies de access y refresh rotadas',
    type: AuthResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Sesión de refresco inválida' })
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
}
