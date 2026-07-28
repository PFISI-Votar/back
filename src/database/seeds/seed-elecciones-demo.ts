import { runSeed } from '@/database/seeds/election-seed-utils';
import { seedEleccionesNacionales2023 } from '@/database/seeds/seed-elecciones-nacionales-2023';
import { seedEleccionesPaso } from '@/database/seeds/seed-elecciones-paso';

if (require.main === module) {
  void runSeed(
    'ELECCIONES NACIONALES 2023 + ELECCIONES PASO',
    async (manager) => {
      await seedEleccionesNacionales2023(manager);
      await seedEleccionesPaso(manager);
    },
  );
}
