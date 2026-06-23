import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';

export const VOTANTE_TOKEN_HEADER = 'x-votante-token';
const VOTANTE_HASH_REGEX = /^[0-9a-f]{64}$/i;

export type VotanteRequest = Request & {
  votanteHash: string;
};

@Injectable()
export class VotanteSessionGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<VotanteRequest>();
    const token = request.header(VOTANTE_TOKEN_HEADER);

    if (!token || !VOTANTE_HASH_REGEX.test(token)) {
      throw new UnauthorizedException('Sesión de votante inválida o ausente');
    }

    request.votanteHash = token.toLowerCase();
    return true;
  }
}
