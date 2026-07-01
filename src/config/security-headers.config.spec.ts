import { createHelmetMiddleware } from '@/config/security-headers.config';

describe('security-headers.config', () => {
  it('creates helmet middleware for production and development', () => {
    expect(createHelmetMiddleware(false)).toBeDefined();
    expect(createHelmetMiddleware(true)).toBeDefined();
  });

  it('enables HSTS only for production middleware', () => {
    const productionMiddleware = createHelmetMiddleware(true);
    const developmentMiddleware = createHelmetMiddleware(false);

    expect(productionMiddleware).not.toBe(developmentMiddleware);
  });
});
