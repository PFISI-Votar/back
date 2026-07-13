import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import type { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { VOTER_ACCESS_COOKIE_NAME } from '@/auth/constants/auth-cookie.constants';
import {
  DEFAULT_JWT_AUDIENCE,
  DEFAULT_JWT_ISSUER,
} from '@/auth/constants/jwt-identity.constants';
import { JwtRole } from '@/auth/enums/jwt-role.enum';
import { VoterJwtPayload } from '@/auth/interfaces/voter-jwt-payload.interface';
import { JwksService } from '@/auth/services/jwks.service';

const extractVoterAccessTokenFromCookie = (request: Request): string | null => {
  const token = request.cookies?.[VOTER_ACCESS_COOKIE_NAME] as
    | string
    | undefined;
  if (typeof token === 'string' && token.length > 0) {
    return token;
  }
  return null;
};

@Injectable()
export class VoterJwtStrategy extends PassportStrategy(Strategy, 'voter-jwt') {
  constructor(configService: ConfigService, jwksService: JwksService) {
    const issuer =
      configService.get<string>('JWT_ISSUER') ?? DEFAULT_JWT_ISSUER;
    const audience =
      configService.get<string>('JWT_AUDIENCE') ?? DEFAULT_JWT_AUDIENCE;

    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        extractVoterAccessTokenFromCookie,
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

  validate(payload: VoterJwtPayload): VoterJwtPayload {
    if (payload.role !== JwtRole.VOTER) {
      throw new UnauthorizedException('No autenticado');
    }
    if (!payload.votanteHash || !payload.idEleccion) {
      throw new UnauthorizedException('No autenticado');
    }
    return payload;
  }
}

export const assertVoterAuthenticatedUser = (
  user: VoterJwtPayload | undefined,
): VoterJwtPayload => {
  if (!user) {
    throw new UnauthorizedException('No autenticado');
  }
  return user;
};
