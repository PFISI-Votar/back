import '@/common/bootstrap/setup-timezone';
import '@/common/bootstrap/load-env';
import { DataSource, DataSourceOptions } from 'typeorm';
import type { TlsOptions } from 'node:tls';
import {
  isDatabaseProductionEnv,
  resolveDatabaseSsl,
} from '@/config/database-ssl.config';

// VOTAR-498: misma política de TLS que src/config/database.config.ts (ver
// resolveDatabaseSsl), aplicada acá vía process.env porque el CLI de
// migraciones no tiene ConfigService disponible.
const isProduction = isDatabaseProductionEnv((key) => process.env[key]);

export const dataSourceOptions: DataSourceOptions = {
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 5432),
  username: process.env.DB_USERNAME ?? 'postgres',
  password: process.env.DB_PASSWORD ?? 'postgres',
  database: process.env.DB_NAME ?? 'votar',
  // Ver el comentario equivalente en src/config/database.config.ts sobre
  // el desajuste de tipos entre TypeORM (tls.TlsOptions) y @types/pg
  // (tls.ConnectionOptions, el que realmente usa el driver en runtime).
  ssl: resolveDatabaseSsl(
    (key) => process.env[key],
    isProduction,
  ) as unknown as boolean | TlsOptions,
  entities: ['src/**/*.entity.ts'],
  migrations: ['src/database/migrations/*.ts'],
  synchronize: false,
};

const dataSource = new DataSource(dataSourceOptions);

export default dataSource;
