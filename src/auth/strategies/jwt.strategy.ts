import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import type { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ACCESS_COOKIE_NAME } from '@/auth/constants/auth-cookie.constants';
import { JwtPayload } from '@/auth/interfaces/jwt-payload.interface';

const extractAccessTokenFromCookie = (request: Request): string | null => {
  const cookies = request.cookies as Record<string, unknown> | undefined;
  const token = cookies?.[ACCESS_COOKIE_NAME];
  if (typeof token === 'string' && token.length > 0) {
    return token;
  }
  return null;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        extractAccessTokenFromCookie,
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET') ?? 'dev-secret',
    });
  }

  validate(payload: JwtPayload): JwtPayload {
    return payload;
  }
}

export const assertAuthenticatedUser = (
  user: JwtPayload | undefined,
): JwtPayload => {
  if (!user) {
    throw new UnauthorizedException('No autenticado');
  }
  return user;
};
