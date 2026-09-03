import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { requireHttpsMiddleware } from '@/common/middleware/require-https.middleware';
import { buildCorsOptions } from '@/config/cors.config';
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

  app.enableCors(buildCorsOptions(configService));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // VOTAR-466: las imágenes electorales dejaron de servirse desde el disco
  // local (/uploads) y ahora viven en Postgres, servidas por
  // GET /imagenes/:idImagen (ElectoralImageController).

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
    .addTag(
      'imagenes',
      'Servido de imágenes electorales persistidas en Postgres (VOTAR-466)',
    )
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: { persistAuthorization: true },
  });
};
