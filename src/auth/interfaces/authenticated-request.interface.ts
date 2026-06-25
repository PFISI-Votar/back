import { Request } from 'express';
import { JwtPayload } from '@/auth/interfaces/jwt-payload.interface';

export type AuthenticatedRequest = Request & {
  user: JwtPayload;
};
