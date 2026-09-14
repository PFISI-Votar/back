import { createHash, randomBytes, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { config } from 'dotenv';
import {
  CLASSIFIED_SECRET_NAMES,
  type ClassifiedSecrets,
} from '../src/vault/classified-secrets';
import {
  SoftwareKmsClient,
  sealEncryptedFile,
  sealKmsEnvelope,
} from '../src/vault/vault-crypto';

/**
 * Sella las claves clasificadas que estén en el entorno hacia un vault.
 *
 *   npm run vault:seal
 *   npm run vault:seal -- --provider kms
 *
 * No imprime el contenido de las claves. El archivo resultante y la clave
 * KMS de software no deben commitearse.
 */
const args = new Set(process.argv.slice(2));
const provider = args.has('--provider')
  ? process.argv[process.argv.indexOf('--provider') + 1]
  : 'encrypted-file';

config({ path: resolve(process.cwd(), '.env') });

const secrets: ClassifiedSecrets = {};
for (const name of CLASSIFIED_SECRET_NAMES) {
  const value = process.env[name]?.trim();
  if (value) {
    secrets[name] = value;
  }
}

if (Object.keys(secrets).length === 0) {
  console.error(
    'No hay claves clasificadas en el entorno. Exportalas o completalas en .env antes de sellar.',
  );
  process.exit(1);
}

const vaultPath = resolve(
  process.env.VAULT_FILE_PATH?.trim() || 'vault/secrets.vault.json',
);

const writeVault = (contents: string): void => {
  mkdirSync(dirname(vaultPath), { recursive: true });
  writeFileSync(vaultPath, contents, { encoding: 'utf8', mode: 0o600 });
};

const main = async (): Promise<void> => {
  if (provider === 'encrypted-file') {
    const masterKey = process.env.VAULT_MASTER_KEY?.trim();
    if (!masterKey || masterKey.length < 16) {
      console.error(
        'Definí VAULT_MASTER_KEY (mínimo 16 caracteres) antes de sellar. Esa es la única clave que queda en el entorno.',
      );
      process.exit(1);
    }
    writeVault(
      `${JSON.stringify(sealEncryptedFile(secrets, masterKey), null, 2)}\n`,
    );
    console.log(`Vault cifrado escrito en ${vaultPath} (mode 0600).`);
    console.log('SECRETS_VAULT_PROVIDER=encrypted-file');
  } else if (provider === 'kms') {
    const keyPath = resolve(
      process.env.VAULT_KMS_KEY_FILE?.trim() || 'vault/kms.key',
    );
    const inline = process.env.VAULT_KMS_KEY?.trim();
    const key = inline ? Buffer.from(inline, 'hex') : randomBytes(32);
    if (!inline) {
      mkdirSync(dirname(keyPath), { recursive: true });
      writeFileSync(keyPath, key.toString('hex'), {
        encoding: 'utf8',
        mode: 0o600,
      });
      console.log(
        `Clave KMS de software generada en ${keyPath} (mode 0600). En producción reemplazala por una clave de HSM/KMS montada fuera del repo.`,
      );
    }
    const document = await sealKmsEnvelope(
      secrets,
      new SoftwareKmsClient(
        key.length === 32 ? key : Buffer.from(inline!, 'hex'),
      ),
    );
    writeVault(`${JSON.stringify(document, null, 2)}\n`);
    console.log(`Sobre KMS escrito en ${vaultPath} (mode 0600).`);
    console.log('SECRETS_VAULT_PROVIDER=kms');
    console.log('VAULT_KMS_MODE=software');
    if (!inline) {
      console.log(`VAULT_KMS_KEY_FILE=${keyPath}`);
    }
  } else {
    console.error(
      'Provider no soportado por el sealer. Usá encrypted-file o kms.',
    );
    process.exit(1);
  }

  console.log(
    `Claves selladas: ${Object.keys(secrets).join(', ')}. Eliminalas del .env y dejá sólo VAULT_MASTER_KEY o la referencia KMS.`,
  );
  console.log(
    `Huella del vault: ${createHash('sha256')
      .update(JSON.stringify(Object.keys(secrets).sort()))
      .digest('hex')
      .slice(0, 12)}`,
  );
};

void main();
