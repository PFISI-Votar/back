import { JwtRole } from '@/auth/enums/jwt-role.enum';

export interface JwtPayload {
  sub: string;
  role: JwtRole;
  email?: string;
  name?: string;
  /**
   * VOTAR-492: id de la `refresh_session` que respalda este access token.
   * Opcional en el tipo (los tokens de votante y los legacy previos al deploy
   * no lo traen); `JwtStrategy` lo exige para el panel admin.
   */
  sid?: number;
}
