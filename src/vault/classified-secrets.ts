/**
 * VOTAR-497 — claves operativas y de validación que no pueden residir en
 * texto plano en `.env` cuando el proceso no está en desarrollo.
 * El relayer, la entidad de firmas y el faucet las leen ya hidratadas.
 */
export const CLASSIFIED_SECRET_NAMES = [
  'PRIVATE_KEY',
  'RELAYER_PRIVATE_KEY',
  'VALIDATOR_PRIVATE_KEY',
  'FAUCET_MASTER_PRIVATE_KEY',
  'JWT_PRIVATE_KEY',
  'BACKUP_ENCRYPTION_KEY',
] as const;

export type ClassifiedSecretName = (typeof CLASSIFIED_SECRET_NAMES)[number];

export type ClassifiedSecrets = Partial<Record<ClassifiedSecretName, string>>;

export const PRODUCTION_VAULT_REQUIRED_MESSAGE =
  'VOTAR-497: en producción las claves operativas no pueden residir en .env. ' +
  'Configurá SECRETS_VAULT_PROVIDER=encrypted-file o kms y sellá el vault (npm run vault:seal).';
