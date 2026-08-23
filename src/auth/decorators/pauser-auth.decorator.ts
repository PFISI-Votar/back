import { applyDecorators, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { Roles } from '@/auth/decorators/roles.decorator';
import { JwtRole } from '@/auth/enums/jwt-role.enum';
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/auth/guards/roles.guard';
import { PauserRoleGuard } from '@/auth/guards/pauser-role.guard';

/**
 * VOTAR-347 — igual que `@AdminAuth()` (JWT + ELECTION_ADMIN) más `PauserRoleGuard`,
 * que exige además `RolAutoridad.PAUSER` en `autoridad_electoral`.
 */
export const PauserAuth = () =>
  applyDecorators(
    UseGuards(JwtAuthGuard, RolesGuard, PauserRoleGuard),
    Roles(JwtRole.ELECTION_ADMIN),
    ApiBearerAuth(),
    ApiResponse({ status: 401, description: 'Unauthorized' }),
    ApiResponse({ status: 403, description: 'Forbidden' }),
  );
