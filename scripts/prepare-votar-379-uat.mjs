#!/usr/bin/env node
/**
 * Prepara un comicio listo para UAT de VOTAR-379 (BUD on-chain).
 * Uso: node scripts/prepare-votar-379-uat.mjs
 */
import { config } from 'dotenv';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const backRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
config({ path: resolve(backRoot, '.env') });
const blockchainEnvPath = resolve(backRoot, '.env.blockchain.local');
if (existsSync(blockchainEnvPath)) {
  config({ path: blockchainEnvPath, override: true });
}

const PORT = process.env.PORT ?? 3000;
const BASE = `http://localhost:${PORT}`;
const NICK = process.env.DEV_ADMIN_NICK;
const PASSWORD = process.env.DEV_ADMIN_PASSWORD;

const log = (msg) => console.log(`[uat-379] ${msg}`);
const fail = (msg) => {
  console.error(`[uat-379] ERROR: ${msg}`);
  process.exit(1);
};

const getCookieHeader = (response) => {
  const raw = response.headers.getSetCookie?.() ?? [];
  if (raw.length > 0) {
    return raw.map((cookie) => cookie.split(';')[0]).join('; ');
  }
  const single = response.headers.get('set-cookie');
  return single
    ? single
        .split(',')
        .map((c) => c.split(';')[0].trim())
        .join('; ')
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
  return { response, body };
};

const fetchPersona = async () => {
  const base = 'https://webservice.frvm.utn.edu.ar/autogestion';
  const loginRes = await fetch(`${base}/login`, {
    method: 'POST',
    headers: { Accept: '*/*', nick: NICK, password: PASSWORD },
  });
  const loginData = await loginRes.json();
  if (!loginRes.ok || !loginData.hashActual) {
    fail('no se pudo obtener persona de Autogestión');
  }
  const auth = Buffer.from(`${NICK}:${loginData.hashActual}`).toString('base64');
  const userRes = await fetch(`${base}/usuarios`, {
    headers: { Accept: '*/*', nick: NICK, Authorization: `Basic ${auth}` },
  });
  const user = await userRes.json();
  const persona = user.persona;
  return {
    dni: String(persona.documento),
    email: String(persona.email).toLowerCase(),
    nombre: `${persona.nombre} ${persona.apellido}`,
  };
};

const main = async () => {
  if (!NICK || !PASSWORD) {
    fail('DEV_ADMIN_NICK / DEV_ADMIN_PASSWORD requeridos en .env');
  }

  log('1) Login admin');
  const login = await api('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nick: NICK, password: PASSWORD }),
  });
  if (!login.response.ok) {
    fail(`login ${login.response.status}: ${JSON.stringify(login.body)}`);
  }
  const cookies = getCookieHeader(login.response);

  log('2) Resolver DNI/email del votante (vos)');
  const persona = await fetchPersona();
  log(`   ${persona.nombre} — DNI ${persona.dni} — ${persona.email}`);

  log('3) Crear comicio BORRADOR');
  const fechaInicio = new Date(Date.now() + 3600_000).toISOString();
  const fechaFin = new Date(Date.now() + 7 * 86400_000).toISOString();
  const create = await api(
    '/elecciones',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nombre: `UAT VOTAR-379 ${new Date().toISOString().slice(0, 19)}`,
        fechaInicio,
        fechaFin,
        tipoVotacion: 'POR_LISTA',
        metodosAutenticacion: ['SSO_INSTITUCIONAL'],
      }),
    },
    cookies,
  );
  if (!create.response.ok) {
    fail(`crear ${create.response.status}: ${JSON.stringify(create.body)}`);
  }
  const idEleccion = create.body.idEleccion;
  log(`   idEleccion=${idEleccion}`);

  log('4) Crear categoría + 2 listas + candidatos');
  const cat = await api(
    `/elecciones/${idEleccion}/categorias`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nombre: 'Presidente',
        descripcion: 'Presidencia del centro',
        minimoPostulantes: 1,
        maximoPostulantes: 1,
        orden: 1,
      }),
    },
    cookies,
  );
  if (!cat.response.ok) {
    fail(`categoria ${cat.response.status}: ${JSON.stringify(cat.body)}`);
  }
  const idCategoria = cat.body.idCategoria;

  const listaA = await api(
    `/elecciones/${idEleccion}/listas`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nombre: 'Lista Azul',
        sigla: 'LA',
        color: '#0ea5e9',
      }),
    },
    cookies,
  );
  const listaB = await api(
    `/elecciones/${idEleccion}/listas`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nombre: 'Lista Celeste',
        sigla: 'LC',
        color: '#2563eb',
      }),
    },
    cookies,
  );
  if (!listaA.response.ok || !listaB.response.ok) {
    fail(`listas: ${JSON.stringify(listaA.body)} / ${JSON.stringify(listaB.body)}`);
  }

  for (const [lista, candidato] of [
    [listaA.body, { nombre: 'Ana', apellido: 'Lopez', orden: 1 }],
    [listaB.body, { nombre: 'Bruno', apellido: 'Paz', orden: 1 }],
  ]) {
    const cand = await api(
      `/listas/${lista.idLista}/candidatos`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idCategoria,
          nombre: candidato.nombre,
          apellido: candidato.apellido,
          orden: candidato.orden,
          datosAdicionales: {},
        }),
      },
      cookies,
    );
    if (!cand.response.ok) {
      fail(`candidato ${cand.response.status}: ${JSON.stringify(cand.body)}`);
    }
  }

  log('5) Importar padrón (vos + 2 dummy)');
  const csv = `dni,email\n${persona.dni},${persona.email}\n30111222,ana@frvm.utn.edu.ar\n30222333,votante2@frvm.utn.edu.ar\n`;
  const form = new FormData();
  form.append('file', new Blob([csv], { type: 'text/csv' }), 'padron-uat-379.csv');
  const imported = await api(
    `/elecciones/${idEleccion}/padron/import`,
    { method: 'POST', body: form },
    cookies,
  );
  if (!imported.response.ok) {
    fail(`padron ${imported.response.status}: ${JSON.stringify(imported.body)}`);
  }
  log(`   procesados=${imported.body.totalProcesados ?? imported.body.totalVotantes}`);

  log('6) Oficializar oferta');
  const ofic = await api(
    `/elecciones/${idEleccion}/oficializar`,
    { method: 'POST' },
    cookies,
  );
  if (!ofic.response.ok) {
    fail(`oficializar ${ofic.response.status}: ${JSON.stringify(ofic.body)}`);
  }
  log(`   estado=${ofic.body.estado ?? 'CONFIGURADA'}`);

  log('7) Publicar Merkle on-chain');
  const publish = await api(
    `/elecciones/${idEleccion}/padron/merkle/publicar`,
    { method: 'POST' },
    cookies,
  );
  if (!publish.response.ok) {
    fail(`publicar ${publish.response.status}: ${JSON.stringify(publish.body)}`);
  }
  log(`   tx=${publish.body.txHash}`);

  // Voting allows CONFIGURADA; force ABIERTA for clearer UX if column update is enough.
  // Prefer service sync via SQL only if needed — CONFIGURADA is accepted by BUD.
  log('8) Verificación BUD');
  const bud = await api(`/elecciones/${idEleccion}/configuracion-bud`);
  if (!bud.response.ok) {
    fail(`bud config ${bud.response.status}`);
  }

  const ballot = process.env.BALLOT_CONTRACT_ADDRESS;
  console.log(`
============================================================
Comicio listo para UAT VOTAR-379
============================================================
URL BUD:     http://localhost:5173/comicios/${idEleccion}/votar
idEleccion:  ${idEleccion}
estado:      ${bud.body.estado}
login:       nick=${NICK}  (tu password UTN / Autogestión)
Ballot SC:   ${ballot}
RPC:         ${process.env.SEPOLIA_RPC_URL ?? 'http://127.0.0.1:8545'}

Asegurate de que front/.env tenga:
  VITE_API_URL=http://localhost:${PORT}
  VITE_BALLOT_CONTRACT_ADDRESS=${ballot}
  VITE_CHAIN_ID=${process.env.CHAIN_ID ?? 31337}
  VITE_RPC_URL=${process.env.SEPOLIA_RPC_URL ?? 'http://127.0.0.1:8545'}
  VITE_VOTE_TRANSMITTER_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
============================================================
`);
};

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});
