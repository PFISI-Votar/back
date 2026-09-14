import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto';
import type { ClassifiedSecrets } from '@/vault/classified-secrets';

const SCRYPT_N = 16_384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;

export type EncryptedFileVault = {
  version: 1;
  provider: 'encrypted-file';
  kdf: 'scrypt';
  cipher: 'aes-256-gcm';
  salt: string;
  iv: string;
  tag: string;
  ciphertext: string;
};

export type KmsEnvelopeVault = {
  version: 1;
  provider: 'kms';
  kms: 'software' | 'http';
  wrappedDek: string;
  iv: string;
  tag: string;
  ciphertext: string;
};

export type VaultDocument = EncryptedFileVault | KmsEnvelopeVault;

export interface KmsClient {
  readonly mode: 'software' | 'http';
  wrap(dek: Buffer): Promise<string>;
  unwrap(wrappedDek: string): Promise<Buffer>;
}

const deriveKey = (masterKey: string, salt: Buffer): Buffer =>
  scryptSync(masterKey, salt, 32, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });

const sealAesGcm = (
  plaintext: Buffer,
  key: Buffer,
): { iv: string; tag: string; ciphertext: string } => {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return {
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    ciphertext: ciphertext.toString('base64'),
  };
};

const openAesGcm = (
  sealed: { iv: string; tag: string; ciphertext: string },
  key: Buffer,
): Buffer => {
  const decipher = createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(sealed.iv, 'base64'),
  );
  decipher.setAuthTag(Buffer.from(sealed.tag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(sealed.ciphertext, 'base64')),
    decipher.final(),
  ]);
};

export const sealEncryptedFile = (
  secrets: ClassifiedSecrets,
  masterKey: string,
): EncryptedFileVault => {
  if (masterKey.length < 16) {
    throw new Error('VAULT_MASTER_KEY debe tener al menos 16 caracteres.');
  }
  const salt = randomBytes(16);
  const sealed = sealAesGcm(
    Buffer.from(JSON.stringify(secrets), 'utf8'),
    deriveKey(masterKey, salt),
  );
  return {
    version: 1,
    provider: 'encrypted-file',
    kdf: 'scrypt',
    cipher: 'aes-256-gcm',
    salt: salt.toString('base64'),
    ...sealed,
  };
};

export const openEncryptedFile = (
  document: EncryptedFileVault,
  masterKey: string,
): ClassifiedSecrets => {
  const plaintext = openAesGcm(
    document,
    deriveKey(masterKey, Buffer.from(document.salt, 'base64')),
  );
  return JSON.parse(plaintext.toString('utf8')) as ClassifiedSecrets;
};

export class SoftwareKmsClient implements KmsClient {
  readonly mode = 'software' as const;

  constructor(private readonly key: Buffer) {
    if (key.length !== 32) {
      throw new Error('La clave KMS de software debe ser de 32 bytes.');
    }
  }

  wrap(dek: Buffer): Promise<string> {
    const sealed = sealAesGcm(dek, this.key);
    return Promise.resolve(
      `swkms:v1:${sealed.iv}:${sealed.tag}:${sealed.ciphertext}`,
    );
  }

  unwrap(wrappedDek: string): Promise<Buffer> {
    const [scheme, version, iv, tag, ciphertext] = wrappedDek.split(':');
    if (scheme !== 'swkms' || version !== 'v1' || !iv || !tag || !ciphertext) {
      throw new Error('wrappedDek de software KMS inválido.');
    }
    return Promise.resolve(openAesGcm({ iv, tag, ciphertext }, this.key));
  }
}

export class HttpKmsClient implements KmsClient {
  readonly mode = 'http' as const;

  constructor(
    private readonly endpoint: string,
    private readonly token?: string,
  ) {}

  private async call(
    action: 'encrypt' | 'decrypt',
    payload: string,
  ): Promise<string> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    };
    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`;
    }
    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(
        action === 'encrypt'
          ? { action, plaintext: payload }
          : { action, ciphertext: payload },
      ),
    });
    if (!response.ok) {
      throw new Error(
        `KMS HTTP respondió ${response.status} al ${action === 'encrypt' ? 'cifrar' : 'descifrar'}.`,
      );
    }
    const body = (await response.json()) as {
      ciphertext?: string;
      plaintext?: string;
    };
    const value = action === 'encrypt' ? body.ciphertext : body.plaintext;
    if (!value) {
      throw new Error('KMS HTTP no devolvió el campo esperado.');
    }
    return value;
  }

  wrap(dek: Buffer): Promise<string> {
    return this.call('encrypt', dek.toString('base64'));
  }

  async unwrap(wrappedDek: string): Promise<Buffer> {
    const plaintext = await this.call('decrypt', wrappedDek);
    return Buffer.from(plaintext, 'base64');
  }
}

export const sealKmsEnvelope = async (
  secrets: ClassifiedSecrets,
  kms: KmsClient,
): Promise<KmsEnvelopeVault> => {
  const dek = randomBytes(32);
  const sealed = sealAesGcm(Buffer.from(JSON.stringify(secrets), 'utf8'), dek);
  return {
    version: 1,
    provider: 'kms',
    kms: kms.mode,
    wrappedDek: await kms.wrap(dek),
    ...sealed,
  };
};

export const openKmsEnvelope = async (
  document: KmsEnvelopeVault,
  kms: KmsClient,
): Promise<ClassifiedSecrets> => {
  const dek = await kms.unwrap(document.wrappedDek);
  if (dek.length !== 32) {
    throw new Error('El KMS devolvió una DEK que no tiene 32 bytes.');
  }
  const plaintext = openAesGcm(document, dek);
  return JSON.parse(plaintext.toString('utf8')) as ClassifiedSecrets;
};

export const parseVaultDocument = (raw: string): VaultDocument => {
  const parsed = JSON.parse(raw) as Partial<VaultDocument>;
  if (parsed.version !== 1 || !parsed.provider) {
    throw new Error('Documento de vault no soportado.');
  }
  return parsed as VaultDocument;
};

/** Comparación en tiempo constante para hashes hex de igual longitud. */
export const hashesEqual = (left: string, right: string): boolean => {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
};
