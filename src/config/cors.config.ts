import { ConfigService } from '@nestjs/config';
import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

const parseOriginsList = (
  corsAllowedOrigins: string | undefined,
  frontendUrl: string,
): string[] => {
  const explicit = corsAllowedOrigins?.trim();
  if (explicit && explicit.length > 0) {
    return explicit
      .split(',')
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0);
  }
  return [frontendUrl];
};

/**
 * Resolves allowed CORS origins from env vars (for WebSocket gateway bootstrap).
 */
export const resolveAllowedOriginsFromEnv = (): string[] =>
  parseOriginsList(
    process.env.CORS_ALLOWED_ORIGINS,
    process.env.FRONTEND_URL ?? 'http://localhost:5173',
  );

/**
 * Resolves allowed CORS origins from CORS_ALLOWED_ORIGINS or FRONTEND_URL (VOTAR-380).
 */
export const resolveAllowedOrigins = (configService: ConfigService): string[] =>
  parseOriginsList(
    configService.get<string>('CORS_ALLOWED_ORIGINS'),
    configService.get<string>('FRONTEND_URL') ?? 'http://localhost:5173',
  );

export const buildCorsOptions = (configService: ConfigService): CorsOptions => {
  const allowedOrigins = resolveAllowedOrigins(configService);
  return {
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Cookie',
      'X-Requested-With',
    ],
    exposedHeaders: ['Retry-After'],
    credentials: true,
    maxAge: 86_400,
    optionsSuccessStatus: 204,
  };
};
