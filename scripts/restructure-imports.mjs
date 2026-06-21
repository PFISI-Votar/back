import { readFileSync, writeFileSync } from 'node:fs';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const dirs = [join(root, 'src'), join(root, 'test')];

const replacements = [
  ['@/eleccion/entities/lista.entity', '@/eleccion/lista/entities/lista.entity'],
  ['@/eleccion/entities/boleta.entity', '@/eleccion/lista/entities/boleta.entity'],
  ['@/eleccion/entities/categoria.entity', '@/eleccion/lista/entities/categoria.entity'],
  ['@/eleccion/entities/candidato.entity', '@/eleccion/candidato/entities/candidato.entity'],
  [
    '@/eleccion/entities/configuracion-datos-candidato.entity',
    '@/eleccion/candidato/entities/configuracion-datos-candidato.entity',
  ],
  [
    '@/eleccion/entities/campo-datos-candidato.entity',
    '@/eleccion/candidato/entities/campo-datos-candidato.entity',
  ],
  ['@/eleccion/dto/lista.dto', '@/eleccion/lista/dto/lista.dto'],
  ['@/eleccion/dto/lista-response.dto', '@/eleccion/lista/dto/lista-response.dto'],
  ['@/eleccion/dto/candidato.dto', '@/eleccion/candidato/dto/candidato.dto'],
  [
    '@/eleccion/dto/configuracion-datos-candidato.dto',
    '@/eleccion/candidato/dto/configuracion-datos-candidato.dto',
  ],
  ['@/eleccion/enums/estado-lista.enum', '@/eleccion/lista/enums/estado-lista.enum'],
  ['@/eleccion/enums/estado-boleta.enum', '@/eleccion/lista/enums/estado-boleta.enum'],
  [
    '@/eleccion/enums/tipo-campo-candidato.enum',
    '@/eleccion/candidato/enums/tipo-campo-candidato.enum',
  ],
  ['@/eleccion/services/lista.service', '@/eleccion/lista/services/lista.service'],
  ['@/eleccion/services/boleta.service', '@/eleccion/lista/services/boleta.service'],
  [
    '@/eleccion/services/oficializacion.service',
    '@/eleccion/lista/services/oficializacion.service',
  ],
  ['@/eleccion/services/candidato.service', '@/eleccion/candidato/services/candidato.service'],
  [
    '@/eleccion/services/configuracion-datos-candidato.service',
    '@/eleccion/candidato/services/configuracion-datos-candidato.service',
  ],
  [
    '@/eleccion/services/candidato-datos-validator.service',
    '@/eleccion/candidato/services/candidato-datos-validator.service',
  ],
  ['@/eleccion/controllers/lista.controller', '@/eleccion/lista/controllers/lista.controller'],
  [
    '@/eleccion/mappers/campo-datos-candidato.mapper',
    '@/eleccion/candidato/mappers/campo-datos-candidato.mapper',
  ],
  [
    '@/eleccion/interfaces/campo-candidato-definicion.interface',
    '@/eleccion/candidato/interfaces/campo-candidato-definicion.interface',
  ],
  [
    '@/eleccion/exceptions/datos-adicionales-validation.exception',
    '@/eleccion/candidato/exceptions/datos-adicionales-validation.exception',
  ],
];

const walk = (dir, files = []) => {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, files);
    } else if (full.endsWith('.ts')) {
      files.push(full);
    }
  }
  return files;
};

for (const dir of dirs) {
  for (const file of walk(dir)) {
    let content = readFileSync(file, 'utf8');
    let changed = false;

    for (const [from, to] of replacements) {
      if (content.includes(from)) {
        content = content.split(from).join(to);
        changed = true;
      }
    }

    if (changed) {
      writeFileSync(file, content);
      console.log('updated', file.replace(root + '/', ''));
    }
  }
}
