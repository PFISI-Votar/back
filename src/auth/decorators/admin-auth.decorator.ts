import { applyDecorators, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { Roles } from '@/auth/decorators/roles.decorator';
import { JwtRole } from '@/auth/enums/jwt-role.enum';
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/auth/guards/roles.guard';

export const AdminAuth = () =>
  applyDecorators(
    UseGuards(JwtAuthGuard, RolesGuard),
    Roles(JwtRole.ELECTION_ADMIN),
    ApiBearerAuth(),
    ApiResponse({ status: 401, description: 'Unauthorized' }),
    ApiResponse({ status: 403, description: 'Forbidden' }),
  );
