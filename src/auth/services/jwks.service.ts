import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createPublicKey, KeyObject } from 'node:crypto';
import { JWKS_CACHE_TTL_MS } from '@/auth/constants/jwt-identity.constants';
import { JwtKeysService } from '@/auth/services/jwt-keys.service';
import {
  decodeJwtProtectedHeader,
  JwtJwk,
  JwtJwksDocument,
} from '@/auth/utils/jwt-key-material.util';

type CachedJwks = {
  document: JwtJwksDocument;
  fetchedAt: number;
};

export type JwtRejectionReason =
  | 'invalid_signature'
  | 'invalid_issuer'
  | 'invalid_audience'
  | 'token_expired'
  | 'token_missing'
  | 'token_malformed';

@Injectable()
export class JwksService {
  private readonly logger = new Logger(JwksService.name);
  private readonly jwksUri: string | undefined;
  private cache: CachedJwks | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly jwtKeysService: JwtKeysService,
  ) {
    const uri = this.configService.get<string>('JWT_JWKS_URI')?.trim();
    this.jwksUri = uri && uri.length > 0 ? uri : undefined;
  }

  /**
   * Resuelve la clave pública de verificación desde JWKS (remoto con caché o local).
   * VOTAR-314: descarga/caché de llaves del JWKS del IdP (o BFF interino).
   */
  async getVerificationKey(rawJwt: string): Promise<KeyObject | string> {
    let kid: string | undefined;
    try {
      const header = decodeJwtProtectedHeader(rawJwt);
      kid = header.kid;
      if (header.alg && header.alg !== 'RS256') {
        throw new UnauthorizedException('Algoritmo JWT no soportado');
      }
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Token JWT malformado');
    }

    const document = await this.getJwksDocument();
    const jwk = this.selectJwk(document, kid);
    if (!jwk) {
      throw new UnauthorizedException('Clave de firma no encontrada en JWKS');
    }

    try {
      return createPublicKey({ key: jwk, format: 'jwk' });
    } catch {
      throw new UnauthorizedException('Clave JWKS inválida');
    }
  }

  async getJwksDocument(forceRefresh = false): Promise<JwtJwksDocument> {
    if (!this.jwksUri) {
      return this.jwtKeysService.getJwks();
    }

    const now = Date.now();
    if (
      !forceRefresh &&
      this.cache &&
      now - this.cache.fetchedAt < JWKS_CACHE_TTL_MS
    ) {
      return this.cache.document;
    }

    const document = await this.fetchRemoteJwks(this.jwksUri);
    this.cache = { document, fetchedAt: now };
    return document;
  }

  /** Expone si el último documento vino de caché (tests). */
  isCacheWarm(): boolean {
    return (
      this.cache !== null &&
      Date.now() - this.cache.fetchedAt < JWKS_CACHE_TTL_MS
    );
  }

  clearCache(): void {
    this.cache = null;
  }

  private async fetchRemoteJwks(uri: string): Promise<JwtJwksDocument> {
    try {
      const response = await fetch(uri, {
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) {
        this.logger.warn(`JWKS HTTP ${response.status} desde ${uri}`);
        throw new UnauthorizedException('No se pudo obtener JWKS del IdP');
      }
      const body = (await response.json()) as JwtJwksDocument;
      if (!body?.keys || !Array.isArray(body.keys) || body.keys.length === 0) {
        throw new UnauthorizedException('JWKS vacío o inválido');
      }
      return body;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      this.logger.warn(`Error al descargar JWKS: ${(error as Error).message}`);
      throw new UnauthorizedException('No se pudo obtener JWKS del IdP');
    }
  }

  private selectJwk(
    document: JwtJwksDocument,
    kid: string | undefined,
  ): JwtJwk | undefined {
    if (kid) {
      return document.keys.find((key) => key.kid === kid);
    }
    return document.keys[0];
  }
}

export const classifyJwtRejection = (
  err: unknown,
  info: unknown,
): JwtRejectionReason => {
  const infoObj = info as { name?: string; message?: string } | undefined;
  const message = [
    infoObj?.name,
    infoObj?.message,
    err instanceof Error ? err.message : '',
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (!message || message.includes('no auth token')) {
    return 'token_missing';
  }
  if (message.includes('expired') || message.includes('jwt expired')) {
    return 'token_expired';
  }
  if (message.includes('audience') || message.includes('aud invalid')) {
    return 'invalid_audience';
  }
  if (message.includes('issuer') || message.includes('iss invalid')) {
    return 'invalid_issuer';
  }
  if (
    message.includes('malformed') ||
    message.includes('invalid token') ||
    message.includes('jwt malformed')
  ) {
    return 'token_malformed';
  }
  return 'invalid_signature';
};
