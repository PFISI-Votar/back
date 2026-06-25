import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLoggerService } from '@/audit/audit-logger.service';
import { AuditLog } from '@/audit/entities/audit-log.entity';

@Module({
  imports: [TypeOrmModule.forFeature([AuditLog])],
  providers: [AuditLoggerService],
  exports: [AuditLoggerService],
})
export class AuditModule {}
