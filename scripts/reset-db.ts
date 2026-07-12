import '@/common/bootstrap/setup-timezone';
import '@/common/bootstrap/load-env';
import dataSource from '@/database/data-source';

const resetDatabase = async () => {
  console.log('Conectando a la base de datos...');
  await dataSource.initialize();

  try {
    console.log('Eliminando todas las tablas...');
    await dataSource.dropDatabase();

    console.log('Ejecutando migraciones...');
    await dataSource.runMigrations();

    console.log('✓ Base de datos reseteada exitosamente');
  } catch (error) {
    console.error('Error al resetear la base de datos:', error);
    process.exit(1);
  } finally {
    await dataSource.destroy();
  }
};

if (require.main === module) {
  void resetDatabase();
}
