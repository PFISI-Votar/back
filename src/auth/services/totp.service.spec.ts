import { TotpService } from '@/auth/services/totp.service';

describe('TotpService', () => {
  const service = new TotpService();

  it('generates a secret and verifies matching codes', () => {
    const secret = service.createSecret();
    expect(secret.length).toBeGreaterThan(10);

    const code = service.generateCode(secret);
    expect(code).toMatch(/^\d{6}$/);

    expect(service.verifyCode(secret, code)).toBe(true);
    expect(service.verifyCode(secret, '000000')).toBe(false);
  });

  it('builds an otpauth URI for authenticator apps', () => {
    const secret = service.createSecret();
    const uri = service.buildOtpauthUrl(secret, 'admin@votar.local');
    expect(uri).toMatch(/^otpauth:\/\/totp\//);
    expect(uri).toContain('VOTAR');
    expect(uri).toContain(secret);
  });
});
