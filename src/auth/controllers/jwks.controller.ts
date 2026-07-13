import { Controller, Get, NotFoundException } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwksDocumentDto } from '@/auth/dto/jwks-document.dto';
import { JwtKeysService } from '@/auth/services/jwt-keys.service';
import { JwksService } from '@/auth/services/jwks.service';
import type { JwtJwksDocument } from '@/auth/utils/jwt-key-material.util';

@ApiTags('auth')
@Controller('auth')
export class JwksController {
  constructor(
    private readonly jwtKeysService: JwtKeysService,
    private readonly jwksService: JwksService,
  ) {}

  @Get('.well-known/jwks.json')
  @ApiOperation({
    summary: 'JWKS público del BFF interino (VOTAR-314)',
    description:
      'Expone las claves públicas RSA con las que el BFF firma access tokens en modo interino ' +
      '(JWT_JWKS_URI vacío). No es el JWKS del SSO institucional: si JWT_JWKS_URI apunta al IdP, ' +
      'este endpoint responde 404 y la verificación usa solo el JWKS remoto.',
  })
  @ApiOkResponse({
    description:
      'Documento JWKS del BFF interino (`{ keys: [{ kid, kty, alg, use, n, e }] }`).',
    type: JwksDocumentDto,
  })
  getJwks(): JwtJwksDocument {
    if (this.jwksService.isRemoteMode()) {
      throw new NotFoundException(
        'JWKS local no publicado: modo SSO (JWT_JWKS_URI remoto)',
      );
    }
    return this.jwtKeysService.getJwks();
  }
}
