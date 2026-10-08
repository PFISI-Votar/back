import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import type { TlsOptions } from 'node:tls';
import { AuditLogImmutabilitySubscriber } from '@/audit/subscribers/audit-log-immutability.subscriber';
import {
  isDatabaseProductionEnv,
  resolveDatabaseSsl,
} from '@/config/database-ssl.config';

/**
 * Builds TypeORM configuration from environment variables.
 *
 * VOTAR-498: `ssl` fuerza TLS hacia PostgreSQL según `DB_SSL_MODE` (ver
 * {@link resolveDatabaseSsl}); en producción rechaza arrancar sin cifrado.
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
  // TypeORM tipa `ssl` como `boolean | tls.TlsOptions` (opciones de
  // servidor), pero lo pasa sin tocar al driver `pg`, cuyas @types/pg
  // declaran correctamente `boolean | tls.ConnectionOptions` (cliente) — de
  // ahí el cast: checkServerIdentity/servername son válidos en runtime y en
  // @types/pg, solo el tipo de TypeORM está desactualizado.
  ssl: resolveDatabaseSsl(
    (key) => configService.get<string>(key),
    isDatabaseProductionEnv((key) => configService.get(key)),
  ) as unknown as boolean | TlsOptions,
  autoLoadEntities: true,
  synchronize: false,
  logging: false,
  subscribers: [AuditLogImmutabilitySubscriber],
});
