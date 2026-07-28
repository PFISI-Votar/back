#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bootstrapDevEnvironment } from './dev-bootstrap.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const backRoot = resolve(__dirname, '..');

// Fix cross-platform: en Windows los binarios son .cmd y requieren shell: true
// Funciona para Windows, Linux y Mac.
const isWindows = process.platform === 'win32';
const cmd = (bin) => (isWindows ? `${bin}.cmd` : bin);

const logReady = () => {
  const port = process.env.PORT ?? 3000;
  const hasBlockchainEnv = existsSync(resolve(backRoot, '.env.blockchain.local'));
  console.log('\n[dev] API lista');
  console.log(`[dev]   API:     http://localhost:${port}`);
  console.log(`[dev]   Swagger: http://localhost:${port}/api/docs`);
  if (hasBlockchainEnv) {
    console.log('[dev]   Blockchain: configuración local cargada desde .env.blockchain.local');
  } else {
    console.warn('[dev]   Blockchain: sin .env.blockchain.local — levantá primero npm run dev en blockchain/');
  }
  console.log('[dev] Presioná Ctrl+C para detener la API\n');
};

const main = async () => {
  let nestProcess;
  let isShuttingDown = false;

  const shutdown = (signal) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log(`\n[dev] Deteniendo (${signal})...`);
    if (nestProcess && !nestProcess.killed) {
      nestProcess.kill('SIGTERM');
    }
    setTimeout(() => process.exit(0), 500);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  try {
    await bootstrapDevEnvironment();

    nestProcess = spawn('npm', ['run', 'dev:api'], {
      cwd: backRoot,
      stdio: 'inherit',
      shell: isWindows,
    });

    nestProcess.on('exit', (code) => {
      if (!isShuttingDown) {
        shutdown(`nest exit ${code ?? 0}`);
      }
    });

    logReady();
  } catch (error) {
    console.error(`[dev] Error: ${error.message}`);
    shutdown('error');
    process.exit(1);
  }
};

main();
