import { randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PRODUCTION_VAULT_REQUIRED_MESSAGE } from '@/vault/classified-secrets';
import {
  assertVaultConfiguredForRuntime,
  hydrateSecretsFromVault,
} from '@/vault/hydrate-secrets';
import {
  SoftwareKmsClient,
  openEncryptedFile,
  openKmsEnvelope,
  sealEncryptedFile,
  sealKmsEnvelope,
} from '@/vault/vault-crypto';

describe('VOTAR-497 vault de secretos', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('cifra y abre un archivo vault sin dejar la clave en el documento', () => {
    const sealed = sealEncryptedFile(
      { RELAYER_PRIVATE_KEY: '0x' + 'ab'.repeat(32) },
      'master-key-de-prueba-32',
    );
    const serialized = JSON.stringify(sealed);
    expect(serialized).not.toContain('ab'.repeat(32));
    expect(
      openEncryptedFile(sealed, 'master-key-de-prueba-32').RELAYER_PRIVATE_KEY,
    ).toBe('0x' + 'ab'.repeat(32));
  });

  it('sella un sobre KMS de software y lo abre con la misma clave', async () => {
    const kms = new SoftwareKmsClient(randomBytes(32));
    const sealed = await sealKmsEnvelope(
      { VALIDATOR_PRIVATE_KEY: '0x' + 'cd'.repeat(32) },
      kms,
    );
    expect(JSON.stringify(sealed)).not.toContain('cd'.repeat(32));
    const opened = await openKmsEnvelope(sealed, kms);
    expect(opened.VALIDATOR_PRIVATE_KEY).toBe('0x' + 'cd'.repeat(32));
  });

  it('en producción rechaza el provider env', () => {
    process.env.NODE_ENV = 'production';
    process.env.DEVELOPMENT = 'false';
    process.env.SECRETS_VAULT_PROVIDER = 'env';
    expect(() => assertVaultConfiguredForRuntime()).toThrow(
      PRODUCTION_VAULT_REQUIRED_MESSAGE,
    );
  });

  it('hidrata process.env desde el archivo cifrado y no exige vault en test', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'votar-vault-'));
    const filePath = join(dir, 'secrets.vault.json');
    writeFileSync(
      filePath,
      JSON.stringify(
        sealEncryptedFile(
          { PRIVATE_KEY: '0x' + '11'.repeat(32) },
          'master-key-de-prueba-32',
        ),
      ),
    );
    process.env.NODE_ENV = 'test';
    process.env.DEVELOPMENT = 'false';
    process.env.SECRETS_VAULT_PROVIDER = 'encrypted-file';
    process.env.VAULT_FILE_PATH = filePath;
    process.env.VAULT_MASTER_KEY = 'master-key-de-prueba-32';
    delete process.env.PRIVATE_KEY;

    await hydrateSecretsFromVault();

    expect(process.env.PRIVATE_KEY).toBe('0x' + '11'.repeat(32));
    expect(readFileSync(filePath, 'utf8')).not.toContain('11'.repeat(32));
    rmSync(dir, { recursive: true, force: true });
  });

  it('en producción rechaza claves clasificadas que siguen en plaintext pese al vault', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'votar-vault-plain-'));
    const filePath = join(dir, 'secrets.vault.json');
    writeFileSync(
      filePath,
      JSON.stringify(
        sealEncryptedFile(
          { PRIVATE_KEY: '0x' + '22'.repeat(32) },
          'master-key-de-prueba-32',
        ),
      ),
    );
    process.env.NODE_ENV = 'production';
    process.env.DEVELOPMENT = 'false';
    process.env.SECRETS_VAULT_PROVIDER = 'encrypted-file';
    process.env.VAULT_FILE_PATH = filePath;
    process.env.VAULT_MASTER_KEY = 'master-key-de-prueba-32';
    process.env.PRIVATE_KEY = '0x' + '33'.repeat(32);

    await expect(hydrateSecretsFromVault()).rejects.toThrow(
      /eliminá del \.env: PRIVATE_KEY/,
    );
    rmSync(dir, { recursive: true, force: true });
  });
});
