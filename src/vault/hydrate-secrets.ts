import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  CLASSIFIED_SECRET_NAMES,
  PRODUCTION_VAULT_REQUIRED_MESSAGE,
  type ClassifiedSecrets,
} from '@/vault/classified-secrets';
import {
  HttpKmsClient,
  SoftwareKmsClient,
  openEncryptedFile,
  openKmsEnvelope,
  parseVaultDocument,
  type KmsClient,
} from '@/vault/vault-crypto';

const DEFAULT_VAULT_PATH = 'vault/secrets.vault.json';

/** Alineado con resolveIsProduction: DEVELOPMENT=false ⇒ producción (salvo Jest). */
export const isProductionRuntime = (): boolean =>
  process.env.DEVELOPMENT === 'false' && process.env.NODE_ENV !== 'test';

export const resolveVaultProvider = (): string =>
  (process.env.SECRETS_VAULT_PROVIDER ?? 'env').trim().toLowerCase();

export const assertVaultConfiguredForRuntime = (): void => {
  if (!isProductionRuntime()) {
    return;
  }
  const provider = resolveVaultProvider();
  if (provider === '' || provider === 'env') {
    throw new Error(PRODUCTION_VAULT_REQUIRED_MESSAGE);
  }
};

const readKeyFile = (filePath: string): Buffer =>
  readFileSync(resolve(filePath));

const createKmsClient = (): KmsClient => {
  const mode = (process.env.VAULT_KMS_MODE ?? 'software').trim().toLowerCase();
  if (mode === 'http') {
    const endpoint = process.env.VAULT_KMS_ENDPOINT?.trim();
    if (!endpoint) {
      throw new Error(
        'VAULT_KMS_ENDPOINT es obligatorio cuando VAULT_KMS_MODE=http.',
      );
    }
    return new HttpKmsClient(endpoint, process.env.VAULT_KMS_TOKEN?.trim());
  }
  const inline = process.env.VAULT_KMS_KEY?.trim();
  const key = inline
    ? Buffer.from(inline, 'hex')
    : readKeyFile(process.env.VAULT_KMS_KEY_FILE?.trim() || 'vault/kms.key');
  return new SoftwareKmsClient(key);
};

const loadVaultSecrets = async (): Promise<ClassifiedSecrets> => {
  const filePath = resolve(
    process.env.VAULT_FILE_PATH?.trim() || DEFAULT_VAULT_PATH,
  );
  const document = parseVaultDocument(readFileSync(filePath, 'utf8'));
  if (document.provider === 'encrypted-file') {
    const masterKey = process.env.VAULT_MASTER_KEY ?? '';
    if (!masterKey) {
      throw new Error(
        'VAULT_MASTER_KEY es obligatorio cuando SECRETS_VAULT_PROVIDER=encrypted-file.',
      );
    }
    return openEncryptedFile(document, masterKey);
  }
  return openKmsEnvelope(document, createKmsClient());
};

/**
 * Carga el vault y sobreescribe las claves clasificadas en `process.env`
 * antes de que Nest lea la configuración. En producción rechaza el provider
 * `env` y cualquier clave clasificada que siga sólo en texto plano.
 */
export const hydrateSecretsFromVault = async (): Promise<void> => {
  assertVaultConfiguredForRuntime();
  const provider = resolveVaultProvider();
  if (provider === 'env') {
    return;
  }
  if (provider !== 'encrypted-file' && provider !== 'kms') {
    throw new Error(
      `SECRETS_VAULT_PROVIDER inválido: ${provider}. Usá env, encrypted-file o kms.`,
    );
  }

  const secrets = await loadVaultSecrets();
  if (isProductionRuntime()) {
    const leaked = CLASSIFIED_SECRET_NAMES.filter(
      (name) => Boolean(process.env[name]?.trim()) && !secrets[name],
    );
    if (leaked.length > 0) {
      throw new Error(
        `Claves clasificadas presentes en el entorno y ausentes del vault: ${leaked.join(', ')}. ` +
          'Sellalas con npm run vault:seal y eliminalas del .env.',
      );
    }
    const stillInEnv = CLASSIFIED_SECRET_NAMES.filter(
      (name) => Boolean(process.env[name]?.trim()) && Boolean(secrets[name]),
    );
    if (stillInEnv.length > 0) {
      throw new Error(
        `Claves clasificadas presentes en el entorno y también en el vault; eliminá del .env: ${stillInEnv.join(', ')}`,
      );
    }
  }

  for (const name of CLASSIFIED_SECRET_NAMES) {
    const value = secrets[name]?.trim();
    if (value) {
      process.env[name] = value;
    }
  }
};
