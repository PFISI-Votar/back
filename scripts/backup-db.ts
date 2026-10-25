/**
 * VOTAR-388 — genera un respaldo cifrado de PostgreSQL en src/backups/.
 *
 * Usage (from back/):
 *   npm run db:backup
 *   BACKUP_REMOTE_DIR=/mnt/offsite/votar npm run db:backup
 */
import { NestFactory } from '@nestjs/core';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
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
class BackupCliModule {}

async function main() {
  const app = await NestFactory.createApplicationContext(BackupCliModule, {
    logger: ['log', 'error', 'warn'],
  });

  try {
    const backupService = app.get(BackupService);
    const result = await backupService.runBackup();
    console.log(
      JSON.stringify(
        {
          ok: true,
          encryptedPath: result.encryptedPath,
          checksumPath: result.checksumPath,
          remotePath: result.remotePath,
          sizeBytes: result.sizeBytes,
          sha256: result.sha256,
          pruned: result.pruned,
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
  console.error(`db:backup falló: ${message}`);
  process.exit(1);
});
