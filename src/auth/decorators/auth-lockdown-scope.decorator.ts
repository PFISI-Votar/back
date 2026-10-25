import { SetMetadata } from '@nestjs/common';

export const AUTH_LOCKDOWN_SCOPE_KEY = 'auth_lockdown_scope';

/**
 * VOTAR-492 §12.2 — marca un handler de autenticación como sujeto al bloqueo de
 * flujos institucionales. `'ADMIN'`: se corta con alcance ADMIN o TODOS (login /
 * 2FA / refresh de autoridades). `'TODOS'`: se corta solo con alcance TODOS
 * (login de votantes).
 */
export type AuthLockdownScopeValue = 'ADMIN' | 'TODOS';

export const AuthLockdownScope = (scope: AuthLockdownScopeValue) =>
  SetMetadata(AUTH_LOCKDOWN_SCOPE_KEY, scope);
