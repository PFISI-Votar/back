/**
 * VOTAR-388 — restaura un respaldo cifrado en una BD de prueba limpia.
 *
 * Usage (from back/):
 *   npm run db:restore -- src/backups/votar-....dump.enc
 *   BACKUP_RESTORE_DB=votar_uat npm run db:restore -- path/to/file.dump.enc
 *
 * La base destino debe existir de antemano (`createdb votar_restore`).
 */
import { NestFactory } from '@nestjs/core';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { resolve } from 'node:path';
import { MailModule } from '@/common/mail/mail.module';
import { envValidationSchema } from '@/config/env.validation';
import { BackupModule } from '@/backups/backup.module';
import { BackupService } from '@/backups/services/backup.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env'],
      validationSchema: envValidationSchema,
      validationOptions: { allowUnknown: true, abortEarly: true },
    }),
    MailModule,
    BackupModule,
  ],
})
class RestoreCliModule {}

async function main() {
  const encArg = process.argv[2];
  if (!encArg) {
    console.error(
      'Uso: npm run db:restore -- <ruta-al-archivo.dump.enc> [nombre-bd-destino]',
    );
    process.exit(1);
  }

  const encryptedPath = resolve(encArg);
  const targetDb = process.argv[3];

  const app = await NestFactory.createApplicationContext(RestoreCliModule, {
    logger: ['log', 'error', 'warn'],
  });

  try {
    const backupService = app.get(BackupService);
    const result = await backupService.restoreBackup(encryptedPath, targetDb);
    console.log(
      JSON.stringify(
        {
          ok: true,
          encryptedPath,
          restoredDatabase: result.restoredDatabase,
        },
        null,
        2,
      ),
    );
  } finally {
    await app.close();
  }
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`db:restore falló: ${message}`);
  process.exit(1);
});
