#!/usr/bin/env node
/**
 * Genera entradas de audit_log ejecutando flujos típicos de comicio (VOTAR-371 demo).
 *
 * Automatiza sync on-chain local (Hardhat): deploy, roles ELECTION_ADMIN y republicación
 * de Merkle si el nodo fue reiniciado.
 *
 * Uso:
 *   PORT=8000 node scripts/seed-audit-log-demo.mjs
 *
 * Requisitos: API en marcha, Hardhat node (`npm run dev` en blockchain/), credenciales UTN en .env
 */
import { config } from 'dotenv';
import { existsSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ensureBackendElectionAdminRole,
  ensureLocalBlockchain,
  ensureMerkleOnChain,
  fundElectionAdminWallets,
} from './lib/local-blockchain.mjs';

const backRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
config({ path: resolve(backRoot, '.env') });
const blockchainEnvPath = resolve(backRoot, '.env.blockchain.local');
if (existsSync(blockchainEnvPath)) {
  config({ path: blockchainEnvPath, override: true });
}

const PORT = process.env.PORT ?? 8000;
const BASE = `http://localhost:${PORT}`;
const FRONTEND = process.env.FRONTEND_URL ?? 'http://localhost:5173';

const CAMPOS_CANDIDATO = [
  {
    clave: 'legajo_utn',
    etiqueta: 'Legajo UTN',
    tipo: 'texto',
    obligatorio: true,
    orden: 1,
    validacion: {
      pattern: '^\\d{4,6}$',
      patternMessage: 'El legajo UTN debe tener entre 4 y 6 dígitos',
    },
  },
  {
    clave: 'dni',
    etiqueta: 'DNI',
    tipo: 'texto',
    obligatorio: true,
    orden: 2,
    validacion: {
      pattern: '^\\d{7,8}$',
      patternMessage: 'El DNI debe tener entre 7 y 8 dígitos numéricos',
    },
  },
  {
    clave: 'cantidad_avales',
    etiqueta: 'Cantidad de avales',
    tipo: 'numero',
    obligatorio: true,
    orden: 3,
    validacion: { min: 1 },
  },
];

const log = (step, detail = '') => {
  console.log(`\n[audit-demo] ${step}${detail ? `: ${detail}` : ''}`);
};

const warn = (message) => {
  console.log(`[audit-demo] ⚠ ${message}`);
};

const fail = (message) => {
  console.error(`[audit-demo] ERROR: ${message}`);
  process.exit(1);
};

const getCookieHeader = (response) => {
  const raw = response.headers.getSetCookie?.() ?? [];
  if (raw.length > 0) {
    return raw.map((cookie) => cookie.split(';')[0]).join('; ');
  }
  const single = response.headers.get('set-cookie');
  return single
    ? single.split(',').map((c) => c.split(';')[0].trim()).join('; ')
    : '';
};

const api = async (path, options = {}, cookies = '') => {
  const headers = { ...(options.headers ?? {}) };
  if (cookies) {
    headers.Cookie = cookies;
  }
  const response = await fetch(`${BASE}${path}`, { ...options, headers });
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { response, body, status: response.status, ok: response.ok };
};

const importPadronCsv = async (idEleccion, csv, filename, cookies) => {
  const form = new FormData();
  form.append('file', new Blob([csv], { type: 'text/csv' }), filename);
  return api(
    `/elecciones/${idEleccion}/padron/import`,
    { method: 'POST', body: form },
    cookies,
  );
};

const crearComicio = async (nombre, cookies) => {
  const fechaInicio = new Date(Date.now() + 120_000).toISOString();
  const fechaFin = new Date(Date.now() + 7 * 86400_000).toISOString();
  const result = await api(
    '/elecciones',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nombre,
        descripcion: 'Seed VOTAR-371 — datos para probar auditoría en el Panel',
        fechaInicio,
        fechaFin,
        tipoVotacion: 'POR_LISTA',
        metodosAutenticacion: ['SSO_INSTITUCIONAL'],
      }),
    },
    cookies,
  );
  if (!result.ok) {
    fail(`crear comicio — ${result.status} ${JSON.stringify(result.body)}`);
  }
  return result.body.idEleccion;
};

const configurarOfertaMinima = async (idEleccion, cookies) => {
  await api(
    `/elecciones/${idEleccion}/configuracion-datos-candidato`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ campos: CAMPOS_CANDIDATO }),
    },
    cookies,
  );

  const lista = await api(
    `/elecciones/${idEleccion}/listas`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nombre: 'Lista Demo Auditoría',
        sigla: 'LDA',
        color: '#2563eb',
      }),
    },
    cookies,
  );
  if (!lista.ok) {
    fail(`crear lista — ${lista.status} ${JSON.stringify(lista.body)}`);
  }

  const categoria = await api(
    `/elecciones/${idEleccion}/categorias`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nombre: 'Presidente',
        maximoPostulantes: 1,
        minimoPostulantes: 1,
      }),
    },
    cookies,
  );
  if (!categoria.ok) {
    fail(`crear categoría — ${categoria.status} ${JSON.stringify(categoria.body)}`);
  }

  const candidato = await api(
    `/listas/${lista.body.idLista}/candidatos`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nombre: 'María',
        apellido: 'Demo',
        idCategoria: categoria.body.idCategoria,
        datosAdicionales: {
          legajo_utn: '14988',
          dni: '40123456',
          cantidad_avales: 2,
        },
      }),
    },
    cookies,
  );
  if (!candidato.ok) {
    fail(`crear candidato — ${candidato.status} ${JSON.stringify(candidato.body)}`);
  }
};

const ensureApiReady = async () => {
  const health = await api('/api/docs');
  if (health.status === 0 || health.status >= 500) {
    fail(`API no responde en ${BASE} — levantá npm run dev en back/`);
  }
};

const postComicioAction = async (path, cookies, label) => {
  const result = await api(path, { method: 'POST' }, cookies);
  if (!result.ok) {
    const detail = JSON.stringify(result.body);
    fail(`${label} ${result.status}: ${detail}`);
  }
  return result.body;
};

const main = async () => {
  const summary = {
    frontendGlobal: `${FRONTEND}/auditoria`,
    backend: BASE,
    events: [],
    comicios: {},
    blockchain: {},
  };

  log('0 Preparar blockchain local (Hardhat)');
  await ensureApiReady();
  const blockchain = await ensureLocalBlockchain({
    onLog: (message) => console.log(`[audit-demo]   ${message}`),
  });
  summary.blockchain.storeAddress = blockchain.storeAddress;
  summary.blockchain.redeployed = blockchain.redeployed;

  if (blockchain.redeployed) {
    warn(
      'Se redeployó MerkleRootStore — si abrir/cerrar falla, reiniciá el backend para cargar la nueva dirección.',
    );
  }

  const electionAdminAddresses = await ensureBackendElectionAdminRole({
    storeAddress: blockchain.storeAddress,
    provider: blockchain.provider,
    onLog: (message) => console.log(`[audit-demo]   ${message}`),
  });
  summary.blockchain.electionAdminAddresses = electionAdminAddresses;

  await fundElectionAdminWallets({
    provider: blockchain.provider,
    onLog: (message) => console.log(`[audit-demo]   ${message}`),
  });

  log('1 Login admin (LOGIN)');
  const login = await api('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      nick: process.env.DEV_ADMIN_NICK,
      password: process.env.DEV_ADMIN_PASSWORD,
    }),
  });
  if (!login.ok) {
    fail(`login ${login.status} — ${JSON.stringify(login.body)}`);
  }
  const cookies = getCookieHeader(login.response);
  console.log(
    `[audit-demo] ✓ ${login.body.user?.name} (${login.body.user?.role})`,
  );
  summary.events.push('LOGIN');

  log('2 Comicio A — padrón inválido (PADRON_CARGADO RECHAZADO)');
  const idFallo = await crearComicio(
    `Comicio Demo Audit FAIL ${Date.now()}`,
    cookies,
  );
  const csvBad = 'nombre,apellido\nJuan,Perez\n';
  const badImport = await importPadronCsv(
    idFallo,
    csvBad,
    'padron-mal.csv',
    cookies,
  );
  if (badImport.ok) {
    warn('padrón inválido fue aceptado (inesperado)');
  } else {
    console.log(`[audit-demo] ✓ rechazado HTTP ${badImport.status}`);
    summary.events.push('PADRON_CARGADO (RECHAZADO)');
    summary.comicios.fallo = idFallo;
  }

  log('3 Comicio B — flujo completo típico');
  const idEleccion = await crearComicio(
    `Comicio Demo Audit FULL ${Date.now()}`,
    cookies,
  );
  summary.comicios.full = idEleccion;
  summary.frontendComicio = `${FRONTEND}/comicios/${idEleccion}/auditoria`;

  log('3a Configurar oferta (lista + categoría + candidato)');
  await configurarOfertaMinima(idEleccion, cookies);
  console.log('[audit-demo] ✓ oferta mínima creada');

  log('3b Importar padrón OK');
  const csvOk =
    'dni,email\n50111222,maria.demo@frvm.utn.edu.ar\n50222333,pablo.demo@frvm.utn.edu.ar\n50111222,maria.demo@frvm.utn.edu.ar\n';
  const imported = await importPadronCsv(
    idEleccion,
    csvOk,
    'padron-demo-ok.csv',
    cookies,
  );
  if (!imported.ok) {
    fail(`importar padrón ${imported.status} — ${JSON.stringify(imported.body)}`);
  }
  console.log(
    `[audit-demo] ✓ importados=${imported.body.totalImportados ?? '?'} duplicados=${imported.body.duplicadosExcluidos ?? '?'}`,
  );
  summary.events.push('PADRON_CARGADO (EXITOSO)');

  log('3c Oficializar → CONFIGURADA');
  const oficializar = await api(
    `/elecciones/${idEleccion}/oficializar`,
    { method: 'POST' },
    cookies,
  );
  if (!oficializar.ok) {
    fail(`oficializar ${oficializar.status}: ${JSON.stringify(oficializar.body)}`);
  }
  console.log(`[audit-demo] ✓ estado=${oficializar.body.estado}`);

  log('3d Publicar Merkle on-chain');
  const publish = await api(
    `/elecciones/${idEleccion}/padron/merkle/publicar`,
    { method: 'POST' },
    cookies,
  );
  if (!publish.ok) {
    fail(`publicar merkle ${publish.status} — ${JSON.stringify(publish.body)}`);
  }
  console.log(`[audit-demo] ✓ tx=${publish.body.txHash ?? 'ok'}`);

  log('3e Verificar / reparar Merkle on-chain');
  await ensureMerkleOnChain({
    baseUrl: BASE,
    idEleccion,
    cookies,
    storeAddress: blockchain.storeAddress,
    provider: blockchain.provider,
    onLog: (message) => console.log(`[audit-demo]   ${message}`),
  });

  log('3f Abrir comicio (COMICIO_ABIERTO)');
  const abrir = await postComicioAction(
    `/elecciones/${idEleccion}/abrir`,
    cookies,
    'abrir',
  );
  console.log(`[audit-demo] ✓ comicio abierto estado=${abrir.estado}`);
  summary.events.push('COMICIO_ABIERTO');

  log('3g Cerrar comicio (COMICIO_CERRADO)');
  const cerrar = await postComicioAction(
    `/elecciones/${idEleccion}/cerrar`,
    cookies,
    'cerrar',
  );
  console.log(`[audit-demo] ✓ comicio cerrado estado=${cerrar.estado}`);
  summary.events.push('COMICIO_CERRADO');

  log('4 Consultar audit log');
  const audit = await api('/audit-log?limit=25&page=1', {}, cookies);
  if (!audit.ok) {
    fail(`audit-log ${audit.status} — ${JSON.stringify(audit.body)}`);
  }
  console.log(`[audit-demo] ✓ total entradas=${audit.body.total}`);
  for (const item of audit.body.items.slice(0, 12)) {
    console.log(
      `  #${item.idLog} ${item.tipoEvento} comicio=${item.idEleccion ?? 'global'} ${item.timestamp}`,
    );
  }

  const actorHash =
    audit.body.items.find((item) => item.tipoEvento === 'LOGIN')?.actor ??
    audit.body.items[0]?.actor;
  if (actorHash) {
    summary.filterActor = actorHash;
    const filtered = await api(
      `/audit-log?actor=${encodeURIComponent(actorHash)}&limit=10`,
      {},
      cookies,
    );
    console.log(
      `[audit-demo] ✓ filtro UAT-01 por actor → ${filtered.body.total} entradas`,
    );
  }

  const critico = await api(
    `/audit-log?tipoEvento=COMICIO_ABIERTO&tipoEvento=COMICIO_CERRADO&tipoEvento=PADRON_CARGADO&idEleccion=${idEleccion}&limit=10`,
    {},
    cookies,
  );
  console.log(
    `[audit-demo] ✓ filtro eventos críticos comicio ${idEleccion} → ${critico.body.total} entradas`,
  );
  for (const item of critico.body.items) {
    console.log(
      `  · ${item.tipoEvento} ${item.resultado ?? ''} @ ${item.timestamp}`,
    );
  }

  const outPath = resolve(backRoot, 'uploads-audit-demo-summary.json');
  writeFileSync(outPath, JSON.stringify(summary, null, 2));

  console.log('\n[audit-demo] ═══ Verificar en el frontend ═══');
  console.log(`  Vista global:      ${summary.frontendGlobal}`);
  console.log(`  Vista por comicio: ${summary.frontendComicio}`);
  console.log(`  Comicío FULL id:   ${idEleccion}`);
  console.log(`  Comicío FAIL id:   ${summary.comicios.fallo ?? '—'}`);
  if (summary.filterActor) {
    console.log(`  UAT-01 actor hash: ${summary.filterActor}`);
  }
  console.log(`  Eventos generados: ${summary.events.join(', ')}`);
  console.log(`  JSON: ${outPath}`);
  console.log('\nSugerencias de filtros en /auditoria:');
  console.log('  • Tipo: COMICIO_ABIERTO + COMICIO_CERRADO + PADRON_CARGADO');
  console.log('  • Comicio: seleccionar el FULL id en el selector');
  console.log('  • Operador: pegar el hash UAT-01 de arriba');
};

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});
