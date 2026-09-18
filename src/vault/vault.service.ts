import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CLASSIFIED_SECRET_NAMES,
  type ClassifiedSecretName,
} from '@/vault/classified-secrets';

/**
 * Acceso a secretos ya hidratados desde el vault (VOTAR-497).
 * En desarrollo el provider `env` deja las claves en process.env; en
 * producción `hydrateSecretsFromVault` las carga desde archivo cifrado o KMS
 * antes de crear la app, así esta lectura no toca un `.env` en claro.
 */
@Injectable()
export class VaultService {
  constructor(private readonly configService: ConfigService) {}

  getSecret(name: ClassifiedSecretName): string | undefined {
    const value = this.configService.get<string>(name)?.trim();
    return value || undefined;
  }

  listClassifiedNames(): readonly ClassifiedSecretName[] {
    return CLASSIFIED_SECRET_NAMES;
  }
}
