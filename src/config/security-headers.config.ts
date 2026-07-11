import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { RequestHandler } from 'express';

const PERMISSIONS_POLICY = 'camera=(), microphone=(), geolocation=()';

const isSwaggerPath = (path: string): boolean =>
  path.startsWith('/api/docs') || path.startsWith('/api/docs-json');

export const createHelmetMiddleware = (
  isProduction: boolean,
): RequestHandler => {
  const apiHelmet = helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    hsts: isProduction
      ? { maxAge: 31_536_000, includeSubDomains: true }
      : false,
    frameguard: { action: 'deny' },
    referrerPolicy: { policy: 'same-origin' },
  });

  const swaggerHelmet = helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    hsts: isProduction
      ? { maxAge: 31_536_000, includeSubDomains: true }
      : false,
    frameguard: { action: 'deny' },
    referrerPolicy: { policy: 'same-origin' },
  });

  return (req, res, next) => {
    if (isSwaggerPath(req.path)) {
      swaggerHelmet(req, res, next);
      return;
    }
    apiHelmet(req, res, next);
  };
};

export const permissionsPolicyMiddleware: RequestHandler = (
  _req,
  res,
  next,
) => {
  res.setHeader('Permissions-Policy', PERMISSIONS_POLICY);
  next();
};

export const applySecurityHeaders = (
  app: INestApplication,
  isProduction: boolean,
): void => {
  const expressApp = app as NestExpressApplication;
  expressApp.use(createHelmetMiddleware(isProduction));
  expressApp.use(permissionsPolicyMiddleware);
};

export const resolveIsProduction = (configService: ConfigService): boolean => {
  const development = configService.get<string | boolean>('DEVELOPMENT');
  // Maneja strings 'true'/'false' y booleanos
  // Si DEVELOPMENT es true o 'true', entonces NO estamos en producción
  if (development === true || development === 'true') {
    return false;
  }
  // Si DEVELOPMENT es false o 'false', estamos en producción
  if (development === false || development === 'false') {
    return true;
  }
  // Por defecto (undefined, null, etc), asumir producción por seguridad
  return true;
};
