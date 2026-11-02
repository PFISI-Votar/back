import {
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  createCipheriv,
  createDecipheriv,
  createPublicKey,
  hkdfSync,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import {
  decodeJwtProtectedHeader,
  JwtJwk,
} from '@/auth/utils/jwt-key-material.util';

const GOOGLE_AUTHORIZATION_ENDPOINT =
  'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const GOOGLE_JWKS_URI = 'https://www.googleapis.com/oauth2/v3/certs';
const GOOGLE_ISSUERS: [string, ...string[]] = [
  'https://accounts.google.com',
  'accounts.google.com',
];
const STATE_TTL_MS = 5 * 60 * 1000;
const JWKS_TTL_MS = 60 * 60 * 1000;
// La cookie de estado viaja cifrada y autenticada (AES-256-GCM): el browser
// no puede leer el nonce ni alterar idEleccion/expiresAt.
const STATE_CIPHER = 'aes-256-gcm';
const STATE_IV_LENGTH = 12;
const STATE_AUTH_TAG_LENGTH = 16;
const STATE_KEY_INFO = 'votar-google-oauth-state-v1';

type GoogleOAuthState = {
  state: string;
  nonce: string;
  idEleccion: number;
  expiresAt: number;
};

type GoogleTokenResponse = {
  id_token?: string;
};

type GoogleIdTokenPayload = {
  sub?: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  nonce?: string;
};

type GoogleJwksDocument = { keys?: JwtJwk[] };

export type GoogleIdentity = {
  sub: string;
  email: string;
  name?: string;
};

@Injectable()
export class GoogleOidcService {
  private jwksCache: { keys: JwtJwk[]; fetchedAt: number } | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
  ) {}

  createAuthorizationRequest(idEleccion: number): {
    authorizationUrl: string;
    stateCookie: string;
  } {
    const config = this.getConfig();
    const oauthState: GoogleOAuthState = {
      state: randomBytes(32).toString('base64url'),
      nonce: randomBytes(32).toString('base64url'),
      idEleccion,
      expiresAt: Date.now() + STATE_TTL_MS,
    };
    const url = new URL(GOOGLE_AUTHORIZATION_ENDPOINT);
    url.searchParams.set('client_id', config.clientId);
    url.searchParams.set('redirect_uri', config.redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', 'openid email profile');
    url.searchParams.set('state', oauthState.state);
    url.searchParams.set('nonce', oauthState.nonce);
    url.searchParams.set('prompt', 'select_account');

    return {
      authorizationUrl: url.toString(),
      stateCookie: this.sealState(oauthState),
    };
  }

  /**
   * Devuelve el comicio de la cookie de estado sólo para elegir a dónde
   * redirigir tras un error; no valida state ni vencimiento.
   */
  readIdEleccionFromStateCookie(
    encodedCookie: string | undefined,
  ): number | null {
    try {
      const { idEleccion } = this.openState(encodedCookie ?? '');
      return Number.isInteger(idEleccion) && idEleccion > 0 ? idEleccion : null;
    } catch {
      return null;
    }
  }

  async authenticateCallback(
    code: string,
    state: string,
    stateCookie: string | undefined,
  ): Promise<{ identity: GoogleIdentity; idEleccion: number }> {
    const oauthState = this.parseAndValidateState(state, stateCookie);
    const idToken = await this.exchangeAuthorizationCode(code);
    const payload = await this.verifyIdToken(idToken, oauthState.nonce);

    if (!payload.sub || !payload.email || payload.email_verified !== true) {
      throw new UnauthorizedException('Identidad de Google inválida');
    }

    return {
      idEleccion: oauthState.idEleccion,
      identity: {
        sub: payload.sub,
        email: payload.email.trim().toLowerCase(),
        name: payload.name?.trim() || undefined,
      },
    };
  }

  private getConfig(): {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
  } {
    const clientId =
      this.configService.get<string>('GOOGLE_OAUTH_CLIENT_ID')?.trim() ?? '';
    const clientSecret =
      this.configService.get<string>('GOOGLE_OAUTH_CLIENT_SECRET')?.trim() ??
      '';
    const redirectUri =
      this.configService.get<string>('GOOGLE_OAUTH_REDIRECT_URI')?.trim() ?? '';
    if (!clientId || !clientSecret || !redirectUri) {
      throw new ServiceUnavailableException(
        'El inicio de sesión con Google no está configurado',
      );
    }
    return { clientId, clientSecret, redirectUri };
  }

  private parseAndValidateState(
    returnedState: string,
    encodedCookie: string | undefined,
  ): GoogleOAuthState {
    if (!returnedState || !encodedCookie) {
      throw new UnauthorizedException('Estado OAuth inválido o expirado');
    }
    try {
      const parsed = this.openState(encodedCookie);
      const expected = Buffer.from(parsed.state ?? '');
      const actual = Buffer.from(returnedState);
      if (
        expected.length === 0 ||
        expected.length !== actual.length ||
        !timingSafeEqual(expected, actual) ||
        !parsed.nonce ||
        !Number.isInteger(parsed.idEleccion) ||
        parsed.idEleccion < 1 ||
        parsed.expiresAt < Date.now()
      ) {
        throw new Error('invalid state');
      }
      return parsed;
    } catch {
      throw new UnauthorizedException('Estado OAuth inválido o expirado');
    }
  }

  private getStateKey(): Buffer {
    const { clientSecret } = this.getConfig();
    return Buffer.from(
      hkdfSync('sha256', clientSecret, Buffer.alloc(0), STATE_KEY_INFO, 32),
    );
  }

  private sealState(oauthState: GoogleOAuthState): string {
    const iv = randomBytes(STATE_IV_LENGTH);
    const cipher = createCipheriv(STATE_CIPHER, this.getStateKey(), iv);
    const ciphertext = Buffer.concat([
      cipher.update(JSON.stringify(oauthState), 'utf8'),
      cipher.final(),
    ]);
    return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString(
      'base64url',
    );
  }

  private openState(encodedCookie: string): GoogleOAuthState {
    const raw = Buffer.from(encodedCookie, 'base64url');
    if (raw.length <= STATE_IV_LENGTH + STATE_AUTH_TAG_LENGTH) {
      throw new Error('invalid state cookie');
    }
    const iv = raw.subarray(0, STATE_IV_LENGTH);
    const authTag = raw.subarray(
      STATE_IV_LENGTH,
      STATE_IV_LENGTH + STATE_AUTH_TAG_LENGTH,
    );
    const ciphertext = raw.subarray(STATE_IV_LENGTH + STATE_AUTH_TAG_LENGTH);
    const decipher = createDecipheriv(STATE_CIPHER, this.getStateKey(), iv);
    decipher.setAuthTag(authTag);
    const plaintext = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString('utf8');
    return JSON.parse(plaintext) as GoogleOAuthState;
  }

  private async exchangeAuthorizationCode(code: string): Promise<string> {
    const config = this.getConfig();
    try {
      const response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: config.clientId,
          client_secret: config.clientSecret,
          redirect_uri: config.redirectUri,
          grant_type: 'authorization_code',
        }),
      });
      if (!response.ok) {
        throw new Error(`token endpoint HTTP ${response.status}`);
      }
      const body = (await response.json()) as GoogleTokenResponse;
      if (!body.id_token) {
        throw new Error('missing id_token');
      }
      return body.id_token;
    } catch {
      throw new UnauthorizedException('No se pudo validar la sesión de Google');
    }
  }

  private async verifyIdToken(
    idToken: string,
    expectedNonce: string,
  ): Promise<GoogleIdTokenPayload> {
    try {
      const header = decodeJwtProtectedHeader(idToken);
      if (header.alg !== 'RS256' || !header.kid) {
        throw new Error('invalid protected header');
      }
      let keys = await this.getGoogleJwks();
      let jwk = keys.find((candidate) => candidate.kid === header.kid);
      if (!jwk) {
        keys = await this.getGoogleJwks(true);
        jwk = keys.find((candidate) => candidate.kid === header.kid);
      }
      if (!jwk) {
        throw new Error('unknown signing key');
      }
      const publicKey = createPublicKey({ key: jwk, format: 'jwk' }).export({
        type: 'spki',
        format: 'pem',
      }) as string;
      const payload = await this.jwtService.verifyAsync<GoogleIdTokenPayload>(
        idToken,
        {
          publicKey,
          algorithms: ['RS256'],
          audience: this.getConfig().clientId,
          issuer: GOOGLE_ISSUERS,
        },
      );
      if (payload.nonce !== expectedNonce) {
        throw new Error('invalid nonce');
      }
      return payload;
    } catch {
      throw new UnauthorizedException('ID token de Google inválido');
    }
  }

  private async getGoogleJwks(forceRefresh = false): Promise<JwtJwk[]> {
    if (
      !forceRefresh &&
      this.jwksCache &&
      Date.now() - this.jwksCache.fetchedAt < JWKS_TTL_MS
    ) {
      return this.jwksCache.keys;
    }
    const response = await fetch(GOOGLE_JWKS_URI, {
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) {
      throw new Error(`Google JWKS HTTP ${response.status}`);
    }
    const document = (await response.json()) as GoogleJwksDocument;
    if (!Array.isArray(document.keys) || document.keys.length === 0) {
      throw new Error('Google JWKS vacío');
    }
    this.jwksCache = { keys: document.keys, fetchedAt: Date.now() };
    return document.keys;
  }
}
