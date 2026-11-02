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

    expect(url.origin).toBe('https://accounts.google.com');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('scope')).toBe('openid email profile');
    expect(url.searchParams.get('state')).toBeTruthy();
    expect(url.searchParams.get('nonce')).toBeTruthy();
    expect(service.readIdEleccionFromStateCookie(request.stateCookie)).toBe(42);
  });

  it('VOTAR-523: la cookie de estado no expone state ni nonce en claro', () => {
    const request = service.createAuthorizationRequest(42);
    const url = new URL(request.authorizationUrl);
    const decoded = Buffer.from(request.stateCookie, 'base64url').toString(
      'latin1',
    );

    expect(decoded).not.toContain(url.searchParams.get('state'));
    expect(decoded).not.toContain(url.searchParams.get('nonce'));
    expect(decoded).not.toContain('idEleccion');
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

  it('VOTAR-523: rechaza una cookie de estado alterada', async () => {
    const request = service.createAuthorizationRequest(42);
    const state = new URL(request.authorizationUrl).searchParams.get(
      'state',
    ) as string;
    const raw = Buffer.from(request.stateCookie, 'base64url');
    raw[raw.length - 1] ^= 0x01;
    const tampered = raw.toString('base64url');

    await expect(
      service.authenticateCallback('code', state, tampered),
    ).rejects.toThrow('Estado OAuth inválido o expirado');
    expect(service.readIdEleccionFromStateCookie(tampered)).toBeNull();
  });

  it('VOTAR-523: rechaza la cookie en claro del formato anterior', () => {
    const legacy = Buffer.from(
      JSON.stringify({ state: 's', nonce: 'n', idEleccion: 42, expiresAt: 0 }),
    ).toString('base64url');

    expect(service.readIdEleccionFromStateCookie(legacy)).toBeNull();
  });
});
