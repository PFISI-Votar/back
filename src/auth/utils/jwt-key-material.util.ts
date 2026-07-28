import { generateKeyPairSync, createPublicKey } from 'node:crypto';
import { JWT_KID } from '@/auth/constants/jwt-identity.constants';

export type JwtKeyMaterial = {
  kid: string;
  privateKeyPem: string;
  publicKeyPem: string;
};

export type JwtJwk = {
  kty?: string;
  kid?: string;
  alg?: string;
  use?: string;
  n?: string;
  e?: string;
  [key: string]: unknown;
};

export type JwtJwksDocument = {
  keys: JwtJwk[];
};

const ephemeralByProcess = new Map<string, JwtKeyMaterial>();

export const resolveJwtKeyMaterial = (options?: {
  privateKeyPem?: string;
  publicKeyPem?: string;
  kid?: string;
}): JwtKeyMaterial => {
  const kid = options?.kid?.trim() || JWT_KID;
  const privateKeyPem = options?.privateKeyPem?.trim();
  const publicKeyPem = options?.publicKeyPem?.trim();

  if (privateKeyPem && publicKeyPem) {
    return { kid, privateKeyPem, publicKeyPem };
  }

  const cacheKey = '__ephemeral__';
  const cached = ephemeralByProcess.get(cacheKey);
  if (cached) {
    return cached;
  }

  const generated = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  const material: JwtKeyMaterial = {
    kid,
    privateKeyPem: generated.privateKey,
    publicKeyPem: generated.publicKey,
  };
  ephemeralByProcess.set(cacheKey, material);
  return material;
};

export const buildJwksDocument = (
  material: JwtKeyMaterial,
): JwtJwksDocument => {
  const keyObject = createPublicKey(material.publicKeyPem);
  const jwk = keyObject.export({ format: 'jwk' }) as JwtJwk;
  return {
    keys: [
      {
        ...jwk,
        kid: material.kid,
        alg: 'RS256',
        use: 'sig',
      },
    ],
  };
};

export const decodeJwtProtectedHeader = (
  rawJwt: string,
): { alg?: string; kid?: string } => {
  const [headerSegment] = rawJwt.split('.');
  if (!headerSegment) {
    throw new Error('JWT malformado');
  }
  const json = Buffer.from(headerSegment, 'base64url').toString('utf8');
  return JSON.parse(json) as { alg?: string; kid?: string };
};
