import '@/common/bootstrap/setup-timezone';
import '@/common/bootstrap/load-env';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from '@/app.module';
import { configureApp } from '@/common/bootstrap/configure-app';
import { hydrateSecretsFromVault } from '@/vault/hydrate-secrets';

async function bootstrap() {
  await hydrateSecretsFromVault();
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  configureApp(app);
  const configService = app.get(ConfigService);
  await app.listen(configService.get<number>('PORT') ?? 3000);
}
void bootstrap();
