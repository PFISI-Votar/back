#!/usr/bin/env node
import { config } from 'dotenv';
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  countElectionAdmins,
  registerElectionAdmin,
  removePlaceholderAdmin,
} from './lib/election-admin.mjs';
import { waitForTcp } from './lib/wait-for-tcp.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const backRoot = resolve(__dirname, '..');

config({ path: resolve(backRoot, '.env') });

const isTruthy = (value) =>
  value === true || value === 'true' || value === '1';

const logStep = (message) => {
  console.log(`\n[dev] ${message}`);
};

const isWindows = process.platform === 'win32';

const runCommand = (command, args, options = {}) =>
  new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? backRoot,
      stdio: options.stdio ?? 'inherit',
      env: { ...process.env, ...options.env },
      shell: isWindows,
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) { resolvePromise(); return; }
      reject(new Error(`${command} ${args.join(' ')} falló con código de salida ${code}`));
    });
  });

const runCommandCapture = (command, args, options = {}) =>
  new Promise((resolvePromise, reject) => {
    let stdout = '';
    const child = spawn(command, args, {
      cwd: options.cwd ?? backRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, ...options.env },
      shell: isWindows,
    });
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { process.stderr.write(chunk); });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) { resolvePromise(stdout.trim()); return; }
      reject(new Error(`${command} ${args.join(' ')} falló con código de salida ${code}`));
    });
  });

const getPendingMigrationCount = async () => {
  const output = await runCommandCapture('npx', [
    'ts-node',
    '-r',
    'tsconfig-paths/register',
    'scripts/check-pending-migrations.ts',
  ]);
  const count = Number(output);
  if (!Number.isInteger(count) || count < 0) {
    throw new Error(
      `No se pudo interpretar migraciones pendientes: "${output}"`,
    );
  }
  return count;
};

const runMigrationsIfNeeded = async () => {
  logStep('Verificando migraciones...');
  const pendingCount = await getPendingMigrationCount();
  if (pendingCount === 0) {
    console.log('[dev] ✓ Migraciones al día');
    return;
  }
  logStep(
    `Ejecutando ${pendingCount} ${pendingCount === 1 ? 'migración pendiente' : 'migraciones pendientes'}...`,
  );
  await runCommand('npm', ['run', 'migrate']);
};

const ensureJwtIdentityConfig = () => {
  // VOTAR-314: access tokens usan RS256 + JWKS. JWT_SECRET es legacy/opcional.
  if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 16) {
    throw new Error(
      'JWT_SECRET (legacy, opcional) debe tener al menos 16 caracteres si está definido.',
    );
  }
  const jwksUri = process.env.JWT_JWKS_URI?.trim();
  if (jwksUri) {
    console.warn(
      '[dev] Modo SSO (JWT_JWKS_URI remoto): el BFF no emite JWT locales; use tokens del IdP.',
    );
  }
};

const ensureDevAdmin = async () => {
  const nick = process.env.DEV_ADMIN_NICK?.trim();
  const password = process.env.DEV_ADMIN_PASSWORD?.trim();

  if (nick && password) {
    // La migración inserta el placeholder votar.admin; hay que borrarlo
    // antes de contar, si no el bootstrap cree que ya hay un admin real.
    if (nick !== 'votar.admin') {
      await removePlaceholderAdmin();
    }
    const adminCount = await countElectionAdmins();
    if (adminCount > 0) {
      console.log('[dev] ✓ Admin ya registrado, omitiendo registro');
      return;
    }
    logStep(`Registrando administrador electoral (${nick}) vía Autogestión...`);
    const autoridad = await registerElectionAdmin(nick, password);
    console.log(
      `[dev] ✓ Admin habilitado: ${autoridad.nombre} <${autoridad.email}>`,
    );
    return;
  }

  const adminCount = await countElectionAdmins();
  if (adminCount === 0) {
    throw new Error(
      'No hay administradores electorales. Configurá DEV_ADMIN_NICK y DEV_ADMIN_PASSWORD en .env o ejecutá npm run admin:register.',
    );
  }

  console.warn(
    '[dev] DEV_ADMIN_NICK / DEV_ADMIN_PASSWORD no configurados. Usá un admin ya registrado o completá esas variables.',
  );
};

const runOptionalSeed = async () => {
  if (!isTruthy(process.env.DEV_SEED_DEMO)) {
    return;
  }
  logStep('Cargando datos demo (DEV_SEED_DEMO=true)...');
  await runCommand('npm', ['run', 'seed']);
};

export const bootstrapDevEnvironment = async () => {
  ensureJwtIdentityConfig();

  const dbHost = process.env.DB_HOST ?? 'localhost';
  const dbPort = Number(process.env.DB_PORT ?? 5432);
  logStep(`Esperando PostgreSQL local en ${dbHost}:${dbPort}...`);
  await waitForTcp(dbHost, dbPort);

  await runMigrationsIfNeeded();
  await ensureDevAdmin();
  await runOptionalSeed();
};
