#!/usr/bin/env node
import { bootstrapDevEnvironment } from './dev-bootstrap.mjs';

bootstrapDevEnvironment().catch(() => {
  console.error(
    '[dev:bootstrap] No se pudo preparar el entorno. Revisá la salida anterior para identificar el paso que falló.',
  );
  process.exit(1);
});
