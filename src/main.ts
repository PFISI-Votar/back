import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  app.useGlobalPipes(new ValidationPipe({
    transform: true,
    whitelist: true,
  }));

  const swaggerConfig = new DocumentBuilder()
    .setTitle('VOTAR API')
    .setDescription(
      'Plataforma de votación electrónica descentralizada — UTN FRVM, Equipo 09. ' +
        'Documentación de los endpoints HTTP off-chain del backend NestJS.',
    )
    .setVersion('1.0.0')
    .addTag('padron', 'Importación y gestión del padrón electoral (US 330)')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: { persistAuthorization: true },
  });

  app.enableCors({
    origin: 'http://localhost:5173',
  });

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();