import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import type { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { VOTER_ACCESS_COOKIE_NAME } from '@/auth/constants/auth-cookie.constants';
import { JwtRole } from '@/auth/enums/jwt-role.enum';
import { VoterJwtPayload } from '@/auth/interfaces/voter-jwt-payload.interface';

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
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        extractVoterAccessTokenFromCookie,
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET') ?? 'dev-secret',
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
