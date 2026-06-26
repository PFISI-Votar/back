import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { VoterAuthenticatedRequest } from '@/auth/interfaces/voter-authenticated-request.interface';

@Injectable()
export class VoterElectionGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<VoterAuthenticatedRequest>();
    const user = request.user;
    if (!user) {
      throw new ForbiddenException('Acceso denegado');
    }
    const routeIdEleccion = Number(
      request.params.idEleccion ?? request.params.id,
    );
    if (!Number.isInteger(routeIdEleccion) || routeIdEleccion <= 0) {
      throw new ForbiddenException('Acceso denegado');
    }
    if (user.idEleccion !== routeIdEleccion) {
      throw new ForbiddenException('Acceso denegado');
    }
    return true;
  }
}
