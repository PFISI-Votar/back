import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { AuditLogImmutabilitySubscriber } from '@/audit/subscribers/audit-log-immutability.subscriber';

/**
 * Builds TypeORM configuration from environment variables.
 */
export const getDatabaseConfig = (
  configService: ConfigService,
): TypeOrmModuleOptions => ({
  type: 'postgres',
  host: configService.get<string>('DB_HOST'),
  port: configService.get<number>('DB_PORT'),
  // Runtime de la app: rol restringido (votar_app), NO el superusuario que
  // usan las migraciones (DB_USERNAME/DB_PASSWORD, ver data-source.ts).
  // Ver migración 1787500000000-AuditLogRoleHardening.ts (VOTAR-493).
  username: configService.get<string>('DB_APP_USERNAME'),
  password: configService.get<string>('DB_APP_PASSWORD'),
  database: configService.get<string>('DB_NAME'),
  autoLoadEntities: true,
  synchronize: false,
  logging: false,
  subscribers: [AuditLogImmutabilitySubscriber],
});
