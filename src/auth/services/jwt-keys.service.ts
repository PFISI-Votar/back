import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  buildJwksDocument,
  JwtJwksDocument,
  JwtKeyMaterial,
  resolveJwtKeyMaterial,
} from '@/auth/utils/jwt-key-material.util';

@Injectable()
export class JwtKeysService {
  private readonly material: JwtKeyMaterial;
  private readonly jwks: JwtJwksDocument;

  constructor(private readonly configService: ConfigService) {
    this.material = resolveJwtKeyMaterial({
      privateKeyPem: this.configService.get<string>('JWT_PRIVATE_KEY'),
      publicKeyPem: this.configService.get<string>('JWT_PUBLIC_KEY'),
      kid: this.configService.get<string>('JWT_KID'),
    });
    this.jwks = buildJwksDocument(this.material);
  }

  getKid(): string {
    return this.material.kid;
  }

  getPrivateKeyPem(): string {
    return this.material.privateKeyPem;
  }

  getPublicKeyPem(): string {
    return this.material.publicKeyPem;
  }

  getJwks(): JwtJwksDocument {
    return this.jwks;
  }
}
