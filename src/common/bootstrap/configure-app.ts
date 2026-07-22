import { join } from 'node:path';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { requireHttpsMiddleware } from '@/common/middleware/require-https.middleware';
import { createGlobalRateLimitMiddleware } from '@/common/rate-limit/global-rate-limit.middleware';
import {
  applySecurityHeaders,
  resolveIsProduction,
} from '@/config/security-headers.config';

export const configureApp = (app: NestExpressApplication): void => {
  const configService = app.get(ConfigService);
  const isProduction = resolveIsProduction(configService);
  const requireHttps = configService.get<boolean>('REQUIRE_HTTPS') === true;

  if (isProduction) {
    app.set('trust proxy', 1);
  }

  applySecurityHeaders(app, isProduction);
  app.use(cookieParser());

  if (isProduction && requireHttps) {
    app.use(requireHttpsMiddleware);
  }

  // VOTAR-394 — rate limiting global por IP (apiRouter)
  const rateLimitWindowMs =
    configService.get<number>('RATE_LIMIT_WINDOW_MS') ?? 60_000;
  const rateLimitMaxRequests =
    configService.get<number>('RATE_LIMIT_MAX_REQUESTS') ?? 100;
  app.use(
    createGlobalRateLimitMiddleware({
      windowMs: rateLimitWindowMs,
      maxRequests: rateLimitMaxRequests,
    }),
  );

  const frontendUrl =
    configService.get<string>('FRONTEND_URL') ?? 'http://localhost:5173';
  app.enableCors({
    origin: frontendUrl,
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useStaticAssets(
    join(process.cwd(), process.env.UPLOADS_DIR ?? 'uploads'),
    {
      prefix: '/uploads/',
    },
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('VOTAR API')
    .setDescription(
      'Plataforma de votación electrónica descentralizada — UTN FRVM, Equipo 09. ' +
        'Documentación de los endpoints HTTP off-chain del backend NestJS.',
    )
    .setVersion('1.0.0')
    .addTag('padron', 'Importación y gestión del padrón electoral (US 330)')
    .addTag('listas', 'Gestión de listas y candidatos (US 318)')
    .addTag('escrutinio', 'Resultados públicos del Dashboard (VOTAR-364)')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: { persistAuthorization: true },
  });
};
