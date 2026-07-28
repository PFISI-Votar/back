import { EntityManager } from 'typeorm';
import {
  ElectionSeedDefinition,
  runSeed,
  seedElection,
} from '@/database/seeds/election-seed-utils';

export const eleccionesNacionales2023Seed: ElectionSeedDefinition = {
  nombre: 'ELECCIONES NACIONALES 2023',
  descripcion:
    'Comicio demo de elecciones nacionales argentinas con votación por lista.',
  tituloBoleta: 'Boleta Única Digital - Elecciones Nacionales 2023',
  listas: [
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
    {
      nombre: 'Unión por la Patria',
      sigla: 'UP',
      color: '#2563eb',
      candidatos: [
        { nombreCompleto: 'Sergio Tomás Massa', rol: 'Presidente' },
        { nombreCompleto: 'Agustín Oscar Rossi', rol: 'Vicepresidente' },
      ],
    },
    {
      nombre: 'Juntos por el Cambio',
      sigla: 'JXC',
      color: '#f59e0b',
      candidatos: [
        { nombreCompleto: 'Patricia Bullrich', rol: 'Presidente' },
        { nombreCompleto: 'Luis Alfonso Petri', rol: 'Vicepresidente' },
      ],
    },
    {
      nombre: 'Frente de Izquierda y de Trabajadores Unidad',
      sigla: 'FIT-U',
      color: '#dc2626',
      candidatos: [
        { nombreCompleto: 'Myriam Teresa Bregman', rol: 'Presidente' },
        { nombreCompleto: 'Nicolás del Caño', rol: 'Vicepresidente' },
      ],
    },
  ],
};

export const seedEleccionesNacionales2023 = async (
  manager: EntityManager,
): Promise<void> => {
  await seedElection(eleccionesNacionales2023Seed, manager);
};

if (require.main === module) {
  void runSeed(
    eleccionesNacionales2023Seed.nombre,
    seedEleccionesNacionales2023,
  );
}
