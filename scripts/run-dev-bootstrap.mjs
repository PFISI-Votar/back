#!/usr/bin/env node
import { bootstrapDevEnvironment } from './dev-bootstrap.mjs';

bootstrapDevEnvironment().catch((error) => {
  console.error(`[dev:bootstrap] Error: ${error.message}`);
  process.exit(1);
});
