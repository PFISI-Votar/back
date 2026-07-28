import { resolveDni } from '@/auth/utils/resolve-dni.util';

describe('resolveDni', () => {
  it('returns dni when present', () => {
    expect(resolveDni({ dni: '30111222' })).toBe('30111222');
  });

  it('coerces numeric dni values', () => {
    expect(resolveDni({ dni: 45703625 } as never)).toBe('45703625');
  });

  it('falls back to documento and numeroDocumento', () => {
    expect(resolveDni({ documento: '40123456' })).toBe('40123456');
    expect(resolveDni({ numeroDocumento: '50999888' })).toBe('50999888');
  });

  it('reads nested documento objects', () => {
    expect(
      resolveDni({
        documento: { numero: 45703625 },
      } as never),
    ).toBe('45703625');
  });

  it('extracts dni from cuil', () => {
    expect(resolveDni({ cuil: '20-45703625-9' } as never)).toBe('45703625');
  });

  it('returns null when no document field is available', () => {
    expect(resolveDni({ legajo: '14988' })).toBeNull();
  });
});
