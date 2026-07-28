import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import type { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ACCESS_COOKIE_NAME } from '@/auth/constants/auth-cookie.constants';
import {
  DEFAULT_JWT_AUDIENCE,
  DEFAULT_JWT_ISSUER,
} from '@/auth/constants/jwt-identity.constants';
import { JwtPayload } from '@/auth/interfaces/jwt-payload.interface';
import { JwksService } from '@/auth/services/jwks.service';

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
  constructor(configService: ConfigService, jwksService: JwksService) {
    const issuer =
      configService.get<string>('JWT_ISSUER') ?? DEFAULT_JWT_ISSUER;
    const audience =
      configService.get<string>('JWT_AUDIENCE') ?? DEFAULT_JWT_AUDIENCE;

    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        extractAccessTokenFromCookie,
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      algorithms: ['RS256'],
      issuer,
      audience,
      secretOrKeyProvider: (
        _request: Request,
        rawJwtToken: string,
        done: (err: Error | null, key?: string | Buffer) => void,
      ) => {
        void jwksService
          .getVerificationKey(rawJwtToken)
          .then((key) => {
            if (typeof key === 'string') {
              done(null, key);
              return;
            }
            done(null, key.export({ type: 'spki', format: 'pem' }));
          })
          .catch((error: Error) => done(error));
      },
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
