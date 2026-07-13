import {
  createServer,
  IncomingMessage,
  Server,
  ServerResponse,
} from 'node:http';
import { generateKeyPairSync } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import jwt from 'jsonwebtoken';
import { JWT_KID } from '@/auth/constants/jwt-identity.constants';
import { JwtKeysService } from '@/auth/services/jwt-keys.service';
import {
  classifyJwtRejection,
  JwksService,
} from '@/auth/services/jwks.service';
import {
  buildJwksDocument,
  resolveJwtKeyMaterial,
} from '@/auth/utils/jwt-key-material.util';

describe('JwksService (VOTAR-314)', () => {
  const pair = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  const suiteMaterial = resolveJwtKeyMaterial({
    kid: JWT_KID,
    privateKeyPem: pair.privateKey,
    publicKeyPem: pair.publicKey,
  });

  const createKeysService = (): JwtKeysService =>
    new JwtKeysService({
      get: (key: string) => {
        if (key === 'JWT_PRIVATE_KEY') return suiteMaterial.privateKeyPem;
        if (key === 'JWT_PUBLIC_KEY') return suiteMaterial.publicKeyPem;
        if (key === 'JWT_KID') return suiteMaterial.kid;
        return undefined;
      },
    } as ConfigService);

  const signWithMaterial = (payload: Record<string, unknown>) =>
    jwt.sign(payload, suiteMaterial.privateKeyPem, {
      algorithm: 'RS256',
      keyid: suiteMaterial.kid,
      issuer: 'https://votar.local/idp',
      audience: 'votar-api',
      expiresIn: '15m',
    });

  it('resuelve clave de verificación desde JWKS local', async () => {
    const keysService = createKeysService();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JwksService,
        { provide: JwtKeysService, useValue: keysService },
        {
          provide: ConfigService,
          useValue: { get: () => undefined },
        },
      ],
    }).compile();

    const jwksService = module.get(JwksService);
    const token = signWithMaterial({ sub: '1', role: 'election_admin' });
    const key = await jwksService.getVerificationKey(token);
    expect(key).toBeDefined();
  });

  it('descarga JWKS remoto y lo cachea (segunda llamada no vuelve a fetch)', async () => {
    const keysService = createKeysService();
    const jwksDoc = buildJwksDocument(suiteMaterial);
    let fetchCount = 0;

    const server: Server = createServer(
      (req: IncomingMessage, res: ServerResponse) => {
        if (req.url === '/jwks') {
          fetchCount += 1;
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(jwksDoc));
          return;
        }
        res.writeHead(404);
        res.end();
      },
    );

    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('server address unavailable');
    }
    const jwksUri = `http://127.0.0.1:${address.port}/jwks`;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JwksService,
        { provide: JwtKeysService, useValue: keysService },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) =>
              key === 'JWT_JWKS_URI' ? jwksUri : undefined,
          },
        },
      ],
    }).compile();

    const jwksService = module.get(JwksService);
    const token = signWithMaterial({ sub: '1' });

    await jwksService.getVerificationKey(token);
    await jwksService.getVerificationKey(token);

    expect(fetchCount).toBe(1);
    expect(jwksService.isCacheWarm()).toBe(true);

    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  });

  it('rechaza kid desconocido en JWKS', async () => {
    const keysService = createKeysService();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JwksService,
        { provide: JwtKeysService, useValue: keysService },
        {
          provide: ConfigService,
          useValue: { get: () => undefined },
        },
      ],
    }).compile();

    const jwksService = module.get(JwksService);
    const token = jwt.sign({ sub: '1' }, suiteMaterial.privateKeyPem, {
      algorithm: 'RS256',
      keyid: 'unknown-kid',
      expiresIn: '15m',
    });

    await expect(jwksService.getVerificationKey(token)).rejects.toThrow(
      /Clave de firma no encontrada/,
    );
  });
});

describe('classifyJwtRejection', () => {
  it('clasifica issuer y audience inválidos', () => {
    expect(classifyJwtRejection(null, { message: 'jwt issuer invalid' })).toBe(
      'invalid_issuer',
    );
    expect(
      classifyJwtRejection(null, { message: 'jwt audience invalid' }),
    ).toBe('invalid_audience');
    expect(classifyJwtRejection(null, { name: 'TokenExpiredError' })).toBe(
      'token_expired',
    );
    expect(
      classifyJwtRejection(null, {
        name: 'JsonWebTokenError',
        message: 'invalid signature',
      }),
    ).toBe('invalid_signature');
  });
});
