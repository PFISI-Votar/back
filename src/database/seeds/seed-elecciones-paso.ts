import { EntityManager } from 'typeorm';
import {
  ElectionSeedDefinition,
  runSeed,
  seedElection,
} from '@/database/seeds/election-seed-utils';

export const eleccionesPasoSeed: ElectionSeedDefinition = {
  nombre: 'ELECCIONES PASO',
  descripcion:
    'Comicio demo de elecciones PASO argentinas con fórmulas por lista.',
  tituloBoleta: 'Boleta Única Digital - Elecciones PASO',
  listas: [
    {
      nombre: 'Juntos por el Cambio',
      sigla: 'JXC',
      color: '#f59e0b',
      candidatos: [
        { nombreCompleto: 'Patricia Bullrich', rol: 'Presidente' },
        { nombreCompleto: 'Luis Alfonso Petri', rol: 'Vicepresidente' },
        { nombreCompleto: 'Horacio Rodríguez Larreta', rol: 'Presidente' },
        { nombreCompleto: 'Gerardo Rubén Morales', rol: 'Vicepresidente' },
      ],
    },
    {
      nombre: 'Unión por la Patria',
      sigla: 'UP',
      color: '#2563eb',
      candidatos: [
        { nombreCompleto: 'Sergio Tomás Massa', rol: 'Presidente' },
        { nombreCompleto: 'Agustín Oscar Rossi', rol: 'Vicepresidente' },
        { nombreCompleto: 'Juan Grabois', rol: 'Presidente' },
        { nombreCompleto: 'Paula Abal Medina', rol: 'Vicepresidente' },
      ],
    },
    {
      nombre: 'La Libertad Avanza',
      sigla: 'LLA',
      color: '#6d28d9',
      candidatos: [
        { nombreCompleto: 'Javier Gerardo Milei', rol: 'Presidente' },
        {
          nombreCompleto: 'Victoria Eugenia Villarruel',
          rol: 'Vicepresidente',
        },
      ],
    },
  ],
};

export const seedEleccionesPaso = async (
  manager: EntityManager,
): Promise<void> => {
  await seedElection(eleccionesPasoSeed, manager);
};

if (require.main === module) {
  void runSeed(eleccionesPasoSeed.nombre, seedEleccionesPaso);
}
