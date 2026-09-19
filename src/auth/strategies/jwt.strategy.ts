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
import { RefreshTokenService } from '@/auth/services/refresh-token.service';

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
  constructor(
    configService: ConfigService,
    jwksService: JwksService,
    private readonly refreshTokenService: RefreshTokenService,
  ) {
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

  /**
   * VOTAR-492: la validación del access token deja de ser puramente stateless.
   * Además de los checks de firma/iss/aud/exp que hace Passport, se exige el
   * claim `sid` y se consulta `refresh_session`: una sesión revocada (contención
   * de incidente) o inactiva invalida el access token de inmediato, sin esperar
   * a su expiración de 15 min. Un token sin `sid` (emitido por este BFF antes
   * del deploy de VOTAR-492) se rechaza: el interceptor del front lo renueva de
   * forma transparente vía `/auth/refresh`. `VoterJwtStrategy` es otra clase y
   * no pasa por acá, así que el flujo anónimo de VOTAR-377 no se ve afectado.
   */
  async validate(
    payload: JwtPayload & { purpose?: string },
  ): Promise<JwtPayload> {
    if (payload.purpose === '2fa_challenge' || !payload.role) {
      throw new UnauthorizedException('Token de acceso inválido');
    }
    if (typeof payload.sid !== 'number') {
      throw new UnauthorizedException('session_revoked: token sin sid');
    }
    await this.refreshTokenService.validateActiveSession(payload.sid);
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
