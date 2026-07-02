import '@/common/bootstrap/setup-timezone';
import { MigrationExecutor } from 'typeorm';
import dataSource from '@/database/data-source';

const main = async (): Promise<void> => {
  await dataSource.initialize();
  try {
    const queryRunner = dataSource.createQueryRunner();
    const executor = new MigrationExecutor(dataSource, queryRunner);
    const pending = await executor.getPendingMigrations();
    console.log(pending.length);
  } finally {
    await dataSource.destroy();
  }
};

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
