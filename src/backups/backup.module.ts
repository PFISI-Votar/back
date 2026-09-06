import { Module } from '@nestjs/common';
import { MailModule } from '@/common/mail/mail.module';
import { BackupService } from './services/backup.service';
import { BackupScheduler } from './services/backup.scheduler';

@Module({
  imports: [MailModule],
  providers: [BackupService, BackupScheduler],
  exports: [BackupService],
})
export class BackupModule {}
