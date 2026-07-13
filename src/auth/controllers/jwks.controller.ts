import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtKeysService } from '@/auth/services/jwt-keys.service';
import type { JwtJwksDocument } from '@/auth/utils/jwt-key-material.util';

@ApiTags('auth')
@Controller('auth')
export class JwksController {
  constructor(private readonly jwtKeysService: JwtKeysService) {}

  @Get('.well-known/jwks.json')
  @ApiOperation({
    summary: 'JWKS público para verificación de firmas JWT (VOTAR-314)',
  })
  getJwks(): JwtJwksDocument {
    return this.jwtKeysService.getJwks();
  }
}
