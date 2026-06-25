process.env.JWT_SECRET =
  process.env.JWT_SECRET ?? 'test-secret-for-e2e-tests-min-16';
process.env.JWT_ACCESS_EXPIRES_IN = process.env.JWT_ACCESS_EXPIRES_IN ?? '15m';
process.env.JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN ?? '8h';
