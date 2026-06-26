import { JwtRole } from '@/auth/enums/jwt-role.enum';

export interface VoterJwtPayload {
  sub: string;
  role: JwtRole.VOTER;
  votanteHash: string;
  idEleccion: number;
  email?: string;
  name?: string;
}
