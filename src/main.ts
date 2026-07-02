import '@/common/bootstrap/setup-timezone';
import { join } from 'node:path';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { AppModule } from '@/app.module';
import { requireHttpsMiddleware } from '@/common/middleware/require-https.middleware';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const configService = app.get(ConfigService);

  app.set('trust proxy', 1);
  app.use(cookieParser());

  const isDevelopment = configService.get<boolean>('DEVELOPMENT') === true;
  const requireHttps = configService.get<boolean>('REQUIRE_HTTPS') === true;
  if (!isDevelopment && requireHttps) {
    app.use(requireHttpsMiddleware);
  }

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
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: { persistAuthorization: true },
  });

  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
