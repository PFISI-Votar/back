import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');

const replacements = [
  ['@/eleccion/services/dto/', '@/eleccion/dto/'],
  ['@/eleccion/services/entities/', '@/eleccion/entities/'],
  ['@/eleccion/services/enums/', '@/eleccion/enums/'],
  ['@/eleccion/services/interfaces/', '@/eleccion/interfaces/'],
  ['@/eleccion/services/exceptions/', '@/eleccion/exceptions/'],
  ['@/eleccion/services/utils/', '@/eleccion/mappers/'],
  ['@/eleccion/controllers/dto/', '@/eleccion/dto/'],
  ['@/eleccion/controllers/entities/', '@/eleccion/entities/'],
  ['@/eleccion/controllers/interfaces/', '@/eleccion/interfaces/'],
  ['@/eleccion/repositories/interfaces/', '@/eleccion/interfaces/'],
  ['@/eleccion/repositories/entities/', '@/eleccion/entities/'],
  ['@/eleccion/repositories/dto/', '@/eleccion/dto/'],
  ['@/eleccion/repositories/enums/', '@/eleccion/enums/'],
  ['@/eleccion/common/utils/', '@/common/utils/'],
  ['@/eleccion/utils/', '@/eleccion/mappers/'],
  [
    '@/eleccion/controllers/candidato.service',
    '@/eleccion/services/candidato.service',
  ],
  [
    '@/eleccion/controllers/configuracion-datos-candidato.service',
    '@/eleccion/services/configuracion-datos-candidato.service',
  ],
  ['@/eleccion/controllers/lista.service', '@/eleccion/services/lista.service'],
  [
    '@/eleccion/controllers/oficializacion.service',
    '@/eleccion/services/oficializacion.service',
  ],
  [
    '@/eleccion/controllers/eleccion.service',
    '@/eleccion/services/eleccion.service',
  ],
  [
    '@/eleccion/candidato-datos-validator.service',
    '@/eleccion/services/candidato-datos-validator.service',
  ],
  [
    '@/eleccion/configuracion-datos-candidato.service',
    '@/eleccion/services/configuracion-datos-candidato.service',
  ],
  ['@/eleccion/candidato.service', '@/eleccion/services/candidato.service'],
  ['@/eleccion/boleta.service', '@/eleccion/services/boleta.service'],
  ['@/eleccion/eleccion.service', '@/eleccion/services/eleccion.service'],
  ['@/eleccion/lista.service', '@/eleccion/services/lista.service'],
  [
    '@/eleccion/oficializacion.service',
    '@/eleccion/services/oficializacion.service',
  ],
  [
    '@/eleccion/eleccion.controller',
    '@/eleccion/controllers/eleccion.controller',
  ],
  ['@/eleccion/lista.controller', '@/eleccion/controllers/lista.controller'],
  [
    '@/eleccion/eleccion.repository',
    '@/eleccion/repositories/eleccion.repository',
  ],
];

const files = execSync('find src test -name "*.ts" -type f', { cwd: root })
  .toString()
  .trim()
  .split('\n')
  .filter(Boolean);

for (const file of files) {
  const fullPath = path.join(root, file);
  let content = readFileSync(fullPath, 'utf8');
  let updated = content;
  for (const [from, to] of replacements) {
    updated = updated.split(from).join(to);
  }
  updated = updated.replace(
    "import '../setup-timezone'",
    "import '@/common/bootstrap/setup-timezone'",
  );
  updated = updated.replace(
    "import './setup-timezone'",
    "import '@/common/bootstrap/setup-timezone'",
  );
  if (updated !== content) {
    writeFileSync(fullPath, updated);
  }
}
