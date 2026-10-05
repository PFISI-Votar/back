process.env.JWT_SECRET =
  process.env.JWT_SECRET ?? 'test-secret-for-e2e-tests-min-16';
process.env.JWT_ACCESS_EXPIRES_IN = process.env.JWT_ACCESS_EXPIRES_IN ?? '15m';
process.env.JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN ?? '8h';
process.env.JWT_ISSUER = process.env.JWT_ISSUER ?? 'https://votar.local/idp';
process.env.JWT_AUDIENCE = process.env.JWT_AUDIENCE ?? 'votar-api';
// VOTAR-498 — clave de cifrado de columnas (totp_secret, nombre); sin ella
// los tests de integración contra Postgres real no podrían backfillear.
process.env.DB_ENCRYPTION_KEY = process.env.DB_ENCRYPTION_KEY ?? 'd'.repeat(64);
