import { JwtRole } from '@/auth/enums/jwt-role.enum';

export interface JwtPayload {
  sub: string;
  role: JwtRole;
  email?: string;
  name?: string;
}
