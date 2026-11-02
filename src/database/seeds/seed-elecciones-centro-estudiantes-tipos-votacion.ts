import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { EntityManager } from 'typeorm';
import { TipoVotacion } from '@/eleccion/enums/tipo-votacion.enum';
import {
  ElectionSeedDefinition,
  runSeed,
  seedElection,
  SeedList,
} from '@/database/seeds/election-seed-utils';

/**
 * Demo para comparar los dos tipos de votación soportados (POR_LISTA y
 * POR_CANDIDATO) con la misma boleta: 9 listas, 4 candidatos por lista
 * repartidos en 3 categorías distintas (Vocal tiene 2 postulantes). Todas
 * las listas y todos los candidatos reutilizan las mismas dos imágenes fijas
 * (en vez del SVG generado por defecto) para poder inspeccionar el pipeline
 * de imágenes con archivos reales.
 */

const NOMBRES = [
  'Ana',
  'Bruno',
  'Carla',
  'Diego',
  'Elena',
  'Franco',
  'Gabriela',
  'Hernán',
  'Inés',
  'Joaquín',
  'Karina',
  'Lucas',
  'Marina',
  'Nicolás',
  'Olivia',
  'Pablo',
  'Rocío',
  'Santiago',
  'Tamara',
  'Valentín',
  'Wanda',
  'Ximena',
  'Yamila',
  'Zacarías',
  'Agustina',
  'Bautista',
  'Camila',
  'Damián',
  'Estela',
  'Federico',
  'Guadalupe',
  'Ismael',
  'Julieta',
  'Kevin',
  'Luciana',
  'Mateo',
];

const APELLIDOS = [
  'Aguirre',
  'Benítez',
  'Castro',
  'Domínguez',
  'Espinoza',
  'Fernández',
  'Gómez',
  'Herrera',
  'Ibáñez',
  'Juárez',
  'Krauss',
  'López',
  'Medina',
  'Núñez',
  'Ortiz',
  'Paz',
  'Quiroga',
  'Ramos',
  'Sosa',
  'Torres',
  'Uriarte',
  'Vega',
  'Weber',
  'Ximénez',
  'Yáñez',
  'Zárate',
];

const LISTAS_INFO: { nombre: string; sigla: string; color: string }[] = [
  { nombre: 'Lista Roja', sigla: 'LR', color: '#dc2626' },
  { nombre: 'Lista Naranja', sigla: 'LN', color: '#ea580c' },
  { nombre: 'Lista Amarilla', sigla: 'LA', color: '#ca8a04' },
  { nombre: 'Lista Verde', sigla: 'LV', color: '#16a34a' },
  { nombre: 'Lista Celeste', sigla: 'LC', color: '#0ea5e9' },
  { nombre: 'Lista Azul', sigla: 'LZ', color: '#2563eb' },
  { nombre: 'Lista Violeta', sigla: 'LI', color: '#7c3aed' },
  { nombre: 'Lista Rosa', sigla: 'LP', color: '#db2777' },
  { nombre: 'Lista Gris', sigla: 'LG', color: '#4b5563' },
];

/** 9 listas × 4 candidatos (Presidente, Secretario General, Vocal x2). */
const buildListas = (): SeedList[] => {
  let nameIndex = 0;
  const nextName = () => {
    const nombreCompleto = `${NOMBRES[nameIndex % NOMBRES.length]} ${
      APELLIDOS[nameIndex % APELLIDOS.length]
    }`;
    nameIndex += 1;
    return nombreCompleto;
  };

  return LISTAS_INFO.map((info) => ({
    ...info,
    candidatos: [
      { nombreCompleto: nextName(), rol: 'Presidente' },
      { nombreCompleto: nextName(), rol: 'Secretario General' },
      { nombreCompleto: nextName(), rol: 'Vocal' },
      { nombreCompleto: nextName(), rol: 'Vocal' },
    ],
  }));
};

const candidatoFotoBuffer = readFileSync(
  join(__dirname, 'assets', 'avatar-demo.jpeg'),
);
const listaLogoBuffer = readFileSync(
  join(__dirname, 'assets', 'lista-logo-demo.jpg'),
);

export const centroEstudiantesPorListaSeed: ElectionSeedDefinition = {
  nombre: 'CENTRO DE ESTUDIANTES - VOTACIÓN POR LISTA',
  descripcion:
    'Comicio demo con 9 listas y 4 candidatos por lista (3 categorías, Vocal con 2 postulantes) para probar la votación por lista.',
  tituloBoleta: 'Boleta Única Digital - Centro de Estudiantes (Por Lista)',
  tipoVotacion: TipoVotacion.POR_LISTA,
  listas: buildListas(),
};

export const centroEstudiantesPorCandidatoSeed: ElectionSeedDefinition = {
  nombre: 'CENTRO DE ESTUDIANTES - VOTACIÓN POR CARGO',
  descripcion:
    'Comicio demo con 9 listas y 4 candidatos por lista (3 categorías, Vocal con 2 postulantes) para probar la votación por cargo.',
  tituloBoleta: 'Boleta Única Digital - Centro de Estudiantes (Por Cargo)',
  tipoVotacion: TipoVotacion.POR_CANDIDATO,
  listas: buildListas(),
};

export const seedCentroEstudiantesTiposVotacion = async (
  manager: EntityManager,
): Promise<void> => {
  const imageOverrides = { candidatoFotoBuffer, listaLogoBuffer };
  await seedElection(centroEstudiantesPorListaSeed, manager, imageOverrides);
  await seedElection(
    centroEstudiantesPorCandidatoSeed,
    manager,
    imageOverrides,
  );
};

if (require.main === module) {
  void runSeed(
    'CENTRO DE ESTUDIANTES (POR LISTA + POR CARGO)',
    seedCentroEstudiantesTiposVotacion,
  );
}
