import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { GoogleOidcService } from '@/auth/services/google-oidc.service';

describe('GoogleOidcService', () => {
  const config = new Map<string, string>([
    ['GOOGLE_OAUTH_CLIENT_ID', 'client-id.apps.googleusercontent.com'],
    ['GOOGLE_OAUTH_CLIENT_SECRET', 'client-secret'],
    [
      'GOOGLE_OAUTH_REDIRECT_URI',
      'http://localhost:3000/auth/votante/google/callback',
    ],
  ]);
  const service = new GoogleOidcService(
    { get: (key: string) => config.get(key) } as ConfigService,
    { verifyAsync: jest.fn() } as unknown as JwtService,
  );

  it('VOTAR-523: genera state y nonce ligados al comicio', () => {
    const request = service.createAuthorizationRequest(42);
    const url = new URL(request.authorizationUrl);
    const stateCookie = JSON.parse(
      Buffer.from(request.stateCookie, 'base64url').toString('utf8'),
    ) as { state: string; nonce: string; idEleccion: number };

    expect(url.origin).toBe('https://accounts.google.com');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('scope')).toBe('openid email profile');
    expect(url.searchParams.get('state')).toBe(stateCookie.state);
    expect(url.searchParams.get('nonce')).toBe(stateCookie.nonce);
    expect(stateCookie.idEleccion).toBe(42);
  });

  it('VOTAR-523: rechaza callback sin cookie de estado', async () => {
    await expect(
      service.authenticateCallback('code', 'state', undefined),
    ).rejects.toThrow('Estado OAuth inválido o expirado');
  });

  it('VOTAR-523: rechaza state distinto al emitido', async () => {
    const request = service.createAuthorizationRequest(42);

    await expect(
      service.authenticateCallback('code', 'otro-state', request.stateCookie),
    ).rejects.toThrow('Estado OAuth inválido o expirado');
  });
});
