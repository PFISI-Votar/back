import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLoggerService } from '@/audit/audit-logger.service';
import { AuditLogController } from '@/audit/controllers/audit-log.controller';
import { AuditLog } from '@/audit/entities/audit-log.entity';
import { AuditLogQueryService } from '@/audit/services/audit-log-query.service';

@Module({
  imports: [TypeOrmModule.forFeature([AuditLog])],
  controllers: [AuditLogController],
  providers: [AuditLoggerService, AuditLogQueryService],
  exports: [AuditLoggerService, AuditLogQueryService],
})
export class AuditModule {}
