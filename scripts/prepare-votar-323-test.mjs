#!/usr/bin/env node
/**
 * Comicio de prueba VOTAR-323 — re-voto configurable + listo para votar (Hardhat local).
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

const PORT = process.env.PORT ?? 8000;
const BASE = `http://localhost:${PORT}`;
const NICK = process.env.DEV_ADMIN_NICK?.trim();
const PASSWORD = process.env.DEV_ADMIN_PASSWORD?.trim();
const AUTOGESTION_BASE =
  process.env.AUTOGESTION_BASE_URL ??
  'https://webservice.frvm.utn.edu.ar/autogestion';
const FRONT = process.env.FRONTEND_URL ?? 'http://localhost:5173';

const log = (msg) => console.log(`[votar-323-test] ${msg}`);
const fail = (msg) => {
  console.error(`[votar-323-test] ERROR: ${msg}`);
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
  if (cookies) headers.Cookie = cookies;
  const response = await fetch(`${BASE}${path}`, { ...options, headers });
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { response, body, ok: response.ok, status: response.status };
};

const fetchPersona = async () => {
  const loginRes = await fetch(`${AUTOGESTION_BASE}/login`, {
    method: 'POST',
    headers: { Accept: '*/*', nick: NICK, password: PASSWORD },
  });
  const loginData = await loginRes.json();
  if (!loginRes.ok || !loginData.hashActual) {
    fail(`Autogestión login ${loginRes.status}`);
  }
  const auth = Buffer.from(`${NICK}:${loginData.hashActual}`).toString(
    'base64',
  );
  const userRes = await fetch(`${AUTOGESTION_BASE}/usuarios`, {
    headers: {
      Accept: '*/*',
      nick: NICK,
      Authorization: `Basic ${auth}`,
    },
  });
  const user = await userRes.json();
  const persona = user.persona;
  const dni = String(persona.documento ?? persona.dni ?? '').replace(/\D/g, '');
  const email = String(persona.email ?? persona.mail ?? '')
    .trim()
    .toLowerCase();
  if (!dni || !email) fail('No se pudo resolver dni/email desde Autogestión');
  return {
    dni,
    email,
    legajo: String(persona.legajo ?? NICK),
    nombre: `${persona.nombre} ${persona.apellido}`,
  };
};

const main = async () => {
  if (!NICK || !PASSWORD) {
    fail('Configurá DEV_ADMIN_NICK y DEV_ADMIN_PASSWORD en .env');
  }

  log('1) Login admin');
  const login = await api('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nick: NICK, password: PASSWORD }),
  });
  if (!login.ok) fail(`login ${login.status}: ${JSON.stringify(login.body)}`);
  const cookies = getCookieHeader(login.response);
  log(`   ${login.body.user?.name} (${login.body.user?.role})`);

  log('2) Identidad votante (Autogestión)');
  const persona = await fetchPersona();
  log(`   ${persona.nombre} — legajo ${persona.legajo} — DNI ${persona.dni}`);

  log('3) Crear comicio BORRADOR');
  const suffix = Date.now();
  const create = await api(
    '/elecciones',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nombre: `Prueba VOTAR-323 re-voto ${suffix}`,
        descripcion:
          'Comicio de prueba local — habilitar/inhabilitar re-voto (VOTAR-323)',
        fechaInicio: new Date(Date.now() + 3600_000).toISOString(),
        fechaFin: new Date(Date.now() + 7 * 86400_000).toISOString(),
        tipoVotacion: 'POR_LISTA',
        metodosAutenticacion: ['SSO_INSTITUCIONAL'],
      }),
    },
    cookies,
  );
  if (!create.ok)
    fail(`crear ${create.status}: ${JSON.stringify(create.body)}`);
  const idEleccion = create.body.idEleccion;
  log(`   idEleccion=${idEleccion}`);

  log('4) Configurar re-voto HABILITADO (VOTAR-323)');
  const revote = await api(
    `/elecciones/${idEleccion}/configuracion-revoto`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        permitirVotoMultiple: true,
        maxVotosPorVotante: 2,
      }),
    },
    cookies,
  );
  if (!revote.ok) {
    fail(`config revoto ${revote.status}: ${JSON.stringify(revote.body)}`);
  }
  log(
    `   permitirVotoMultiple=${revote.body.permitirVotoMultiple} maxVotos=${revote.body.maxVotosPorVotante} politica=${revote.body.politicaRevoto}`,
  );

  log('5) Oferta electoral (categoría + 2 listas)');
  const cat = await api(
    `/elecciones/${idEleccion}/categorias`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nombre: 'Presidente',
        minimoPostulantes: 1,
        maximoPostulantes: 1,
        orden: 1,
      }),
    },
    cookies,
  );
  if (!cat.ok) fail(`categoria ${cat.status}`);
  const idCategoria = cat.body.idCategoria;

  for (const spec of [
    { nombre: 'Lista Azul', sigla: 'LAZ', apellido: 'Azul' },
    { nombre: 'Lista Verde', sigla: 'LVE', apellido: 'Verde' },
  ]) {
    const lista = await api(
      `/elecciones/${idEleccion}/listas`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: spec.nombre,
          sigla: spec.sigla,
          color: '#2563eb',
        }),
      },
      cookies,
    );
    if (!lista.ok) fail(`lista ${lista.status}`);
    const cand = await api(
      `/listas/${lista.body.idLista}/candidatos`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idCategoria,
          nombre: 'Candidato',
          apellido: spec.apellido,
          orden: 1,
          datosAdicionales: {},
        }),
      },
      cookies,
    );
    if (!cand.ok) fail(`candidato ${cand.status}`);
  }

  log('6) Importar padrón (Bruno + dummy)');
  const csv = `dni,email\n${persona.dni},${persona.email}\n30111222,ana@frvm.utn.edu.ar\n`;
  const form = new FormData();
  form.append(
    'file',
    new Blob([csv], { type: 'text/csv' }),
    'padron-votar-323.csv',
  );
  const imported = await api(
    `/elecciones/${idEleccion}/padron/import`,
    { method: 'POST', body: form },
    cookies,
  );
  if (!imported.ok)
    fail(`padron ${imported.status}: ${JSON.stringify(imported.body)}`);
  log(
    `   votantes=${imported.body.totalProcesados ?? imported.body.totalVotantes ?? 2}`,
  );

  log(
    '7) Oficializar (+ deploy createElection si backend tiene ELECTION_ADMIN_PRIVATE_KEY)',
  );
  const ofic = await api(
    `/elecciones/${idEleccion}/oficializar`,
    { method: 'POST' },
    cookies,
  );
  if (!ofic.ok)
    fail(`oficializar ${ofic.status}: ${JSON.stringify(ofic.body)}`);
  log(`   estado=${ofic.body.estado}`);

  log('8) Publicar Merkle on-chain');
  const publish = await api(
    `/elecciones/${idEleccion}/padron/merkle/publicar`,
    { method: 'POST' },
    cookies,
  );
  if (!publish.ok) {
    fail(`publicar merkle ${publish.status}: ${JSON.stringify(publish.body)}`);
  }
  log(`   tx=${publish.body.txHash ?? publish.body.txHashPublicacion ?? 'ok'}`);

  log('9) Abrir comicio');
  const abrir = await api(
    `/elecciones/${idEleccion}/abrir`,
    { method: 'POST' },
    cookies,
  );
  if (!abrir.ok) fail(`abrir ${abrir.status}: ${JSON.stringify(abrir.body)}`);
  log(`   estado=${abrir.body.estado}`);

  log('10) Verificar login votante + estado-revoto');
  const voterLogin = await api('/auth/votante/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      nick: persona.legajo,
      password: PASSWORD,
      idEleccion,
    }),
  });
  if (!voterLogin.ok) {
    fail(
      `votante login ${voterLogin.status}: ${JSON.stringify(voterLogin.body)}`,
    );
  }
  const voterCookies = getCookieHeader(voterLogin.response);
  const estadoRevoto = await api(
    `/elecciones/${idEleccion}/estado-revoto`,
    {},
    voterCookies,
  );
  if (!estadoRevoto.ok) {
    fail(
      `estado-revoto ${estadoRevoto.status}: ${JSON.stringify(estadoRevoto.body)}`,
    );
  }
  log(
    `   revoteHabilitado=${estadoRevoto.body.revoteHabilitado} intentosRestantes=${estadoRevoto.body.intentosRestantes}`,
  );

  console.log(`
════════════════════════════════════════════════════════════
  COMICIO DE PRUEBA VOTAR-323 — LISTO PARA VOTAR
════════════════════════════════════════════════════════════
  idEleccion:         ${idEleccion}
  estado:             ${abrir.body.estado}
  re-voto (off-chain): ${estadoRevoto.body.revoteHabilitado ? 'HABILITADO' : 'DESHABILITADO'}
  intentos restantes: ${estadoRevoto.body.intentosRestantes}

  Panel admin (config re-voto — solo BORRADOR):
    ${FRONT}/comicios/${idEleccion}

  Boleta Única Digital (login votante):
    ${FRONT}/comicios/${idEleccion}/votar
    nick/legajo: ${persona.legajo}
    password:    (tu password UTN / Autogestión)

  Probar VOTAR-323:
  1. Entrá al panel del comicio y revisá "Política de re-voto"
  2. Votá en la BUD — con re-voto ON podés emitir y luego "Modificar voto"
  3. Para probar re-voto OFF: creá otro comicio o cambiá en BORRADOR antes de oficializar

  Nota: si reiniciaste el backend después de agregar ELECTION_ADMIN_PRIVATE_KEY
  en .env.blockchain.local, el deploy createElection selló revote on-chain al oficializar.
  El front local usa VITE_BALLOT_CONTRACT_ADDRESS global de Hardhat para castVote.
════════════════════════════════════════════════════════════
`);
};

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});
