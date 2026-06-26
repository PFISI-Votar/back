import { Request } from 'express';
import { VoterJwtPayload } from '@/auth/interfaces/voter-jwt-payload.interface';

export type VoterAuthenticatedRequest = Request & {
  user: VoterJwtPayload;
};
