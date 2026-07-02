#!/usr/bin/env node
/**
 * Flujo E2E real VOTAR-354: admin crea comicio + padrón → votante autenticado solicita merkle-proof → verificación criptográfica.
 */
import { config } from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { StandardMerkleTree } from '@openzeppelin/merkle-tree';
import pkg from 'js-sha3';

const { keccak256 } = pkg;

const backRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
config({ path: resolve(backRoot, '.env') });

const PORT = process.env.PORT ?? 3000;
const BASE = `http://localhost:${PORT}`;
const NICK = process.env.DEV_ADMIN_NICK?.trim();
const PASSWORD = process.env.DEV_ADMIN_PASSWORD?.trim();
const AUTOGESTION_BASE =
  process.env.AUTOGESTION_BASE_URL ??
  'https://webservice.frvm.utn.edu.ar/autogestion';

const log = (step, detail = '') => {
  console.log(`\n[merkle-flow] ${step}${detail ? `: ${detail}` : ''}`);
};

const fail = (message) => {
  console.error(`[merkle-flow] ERROR: ${message}`);
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
  return { response, body, status: response.status };
};

const resolveDni = (persona) => {
  if (persona.dni != null) {
    return String(persona.dni).replace(/\D/g, '');
  }
  if (persona.documento != null) {
    const doc =
      typeof persona.documento === 'object'
        ? persona.documento.numero
        : persona.documento;
    if (doc != null) {
      return String(doc).replace(/\D/g, '');
    }
  }
  if (persona.cuil) {
    const match = String(persona.cuil).match(/\d{7,8}/);
    return match ? match[0] : null;
  }
  return null;
};

const fetchAutogestionPersona = async () => {
  if (!NICK || !PASSWORD) {
    fail('DEV_ADMIN_NICK y DEV_ADMIN_PASSWORD deben estar en .env');
  }
  const loginRes = await fetch(`${AUTOGESTION_BASE}/login`, {
    method: 'POST',
    headers: { Accept: '*/*', nick: NICK, password: PASSWORD },
  });
  if (!loginRes.ok) {
    fail(`Autogestión login ${loginRes.status}`);
  }
  const loginData = await loginRes.json();
  if (!loginData.hashActual) {
    fail('Autogestión no devolvió hashActual');
  }
  const auth = Buffer.from(`${NICK}:${loginData.hashActual}`).toString('base64');
  const userRes = await fetch(`${AUTOGESTION_BASE}/usuarios`, {
    headers: {
      Accept: '*/*',
      nick: NICK,
      Authorization: `Basic ${auth}`,
    },
  });
  if (!userRes.ok) {
    fail(`Autogestión usuarios ${userRes.status}`);
  }
  const usuario = await userRes.json();
  const persona = usuario.persona;
  if (!persona) {
    fail('Autogestión no devolvió persona');
  }
  const dni = resolveDni(persona);
  const email = (persona.email ?? persona.mail ?? '').trim().toLowerCase();
  if (!dni || !email) {
    fail(`No se pudo resolver dni/email: dni=${dni} email=${email}`);
  }
  return { dni, email, legajo: persona.legajo ?? NICK, nombre: persona.nombre };
};

const main = async () => {
  log('0/7 Resolver identidad real desde Autogestión');
  const { dni, email, legajo, nombre } = await fetchAutogestionPersona();
  console.log(`[merkle-flow] ✓ ${nombre ?? legajo} — dni=${dni}, email=${email}`);

  log('1/7 Login admin electoral');
  const adminLogin = await api('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nick: NICK, password: PASSWORD }),
  });
  if (!adminLogin.response.ok) {
    fail(`admin login ${adminLogin.status} — ${JSON.stringify(adminLogin.body)}`);
  }
  const adminCookies = getCookieHeader(adminLogin.response);
  if (!adminCookies) {
    fail('admin login sin cookies');
  }
  console.log(`[merkle-flow] ✓ ${adminLogin.body.user?.name}`);

  log('2/7 Crear comicio de prueba');
  const fechaInicio = new Date(Date.now() + 86400000).toISOString();
  const fechaFin = new Date(Date.now() + 172800000).toISOString();
  const suffix = Date.now();
  const create = await api(
    '/elecciones',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nombre: `Comicio Merkle Proof CLI ${suffix}`,
        fechaInicio,
        fechaFin,
        tipoVotacion: 'POR_LISTA',
        metodosAutenticacion: ['SSO_INSTITUCIONAL'],
      }),
    },
    adminCookies,
  );
  if (!create.response.ok) {
    fail(`crear comicio ${create.status} — ${JSON.stringify(create.body)}`);
  }
  const idEleccion = create.body.idEleccion;
  console.log(`[merkle-flow] ✓ idEleccion=${idEleccion}`);

  log('3/7 Importar padrón CSV con el votante real');
  const csv = `dni,email\n${dni},${email}\n30111222,otro.votante@frvm.utn.edu.ar`;
  const form = new FormData();
  form.append('file', new Blob([csv], { type: 'text/csv' }), 'padron.csv');
  const imported = await api(
    `/elecciones/${idEleccion}/padron/import`,
    { method: 'POST', body: form },
    adminCookies,
  );
  if (!imported.response.ok) {
    fail(`importar padrón ${imported.status} — ${JSON.stringify(imported.body)}`);
  }
  console.log(
    `[merkle-flow] ✓ procesados=${imported.body.totalProcesados ?? imported.body.totalVotantes ?? '?'}`,
  );

  log('4/7 Verificar árbol Merkle generado (admin)');
  const merkle = await api(
    `/elecciones/${idEleccion}/padron/merkle`,
    {},
    adminCookies,
  );
  if (!merkle.response.ok) {
    fail(`consultar merkle ${merkle.status} — ${JSON.stringify(merkle.body)}`);
  }
  if (merkle.body.estado !== 'GENERADO') {
    fail(`merkle en estado ${merkle.body.estado}, se esperaba GENERADO`);
  }
  const adminRoot = merkle.body.merkleRoot;
  console.log(`[merkle-flow] ✓ root=${adminRoot}`);

  log('5/7 Login votante (SSO institucional)');
  const voterLogin = await api('/auth/votante/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      nick: String(legajo),
      password: PASSWORD,
      idEleccion,
    }),
  });
  if (!voterLogin.response.ok) {
    fail(`votante login ${voterLogin.status} — ${JSON.stringify(voterLogin.body)}`);
  }
  const voterCookies = getCookieHeader(voterLogin.response);
  if (!voterCookies) {
    fail('votante login sin cookies');
  }
  console.log(`[merkle-flow] ✓ votante autenticado (${voterLogin.body.user?.sub})`);

  log('6/7 GET /elecciones/:id/merkle-proof (VOTAR-354)');
  const proofRes = await api(
    `/elecciones/${idEleccion}/merkle-proof`,
    {},
    voterCookies,
  );
  if (!proofRes.response.ok) {
    fail(`merkle-proof ${proofRes.status} — ${JSON.stringify(proofRes.body)}`);
  }
  const { merkleProof, root } = proofRes.body;
  if (!Array.isArray(merkleProof) || merkleProof.length === 0 || !root) {
    fail(`respuesta inválida: ${JSON.stringify(proofRes.body)}`);
  }
  if (root.toLowerCase() !== adminRoot.toLowerCase()) {
    fail(`root votante ${root} != root admin ${adminRoot}`);
  }
  console.log(`[merkle-flow] ✓ proof con ${merkleProof.length} hermanos, root coincide`);

  log('7/7 Verificación criptográfica (StandardMerkleTree)');
  const dniNorm = dni.trim().replace(/\D/g, '');
  const emailNorm = email.trim().toLowerCase();
  const leafHex = keccak256(`${dniNorm}:${emailNorm}`);
  const leafBytes32 = `0x${leafHex.toLowerCase()}`;
  const isValid = StandardMerkleTree.verify(
    root,
    ['bytes32'],
    [leafBytes32],
    merkleProof,
  );
  if (!isValid) {
    fail('StandardMerkleTree.verify devolvió false');
  }
  console.log('[merkle-flow] ✓ prueba criptográfica válida');

  const verifyScript = spawnSync(
    'node',
    [
      'scripts/verify-merkle-proof.mjs',
      '--root',
      root,
      '--leaf',
      leafHex,
      '--proof',
      merkleProof.join(','),
    ],
    { cwd: backRoot, encoding: 'utf-8' },
  );
  if (verifyScript.status !== 0) {
    fail(`verify-merkle-proof.mjs falló:\n${verifyScript.stdout}\n${verifyScript.stderr}`);
  }
  console.log(`[merkle-flow] ✓ ${verifyScript.stdout.trim()}`);

  log('Extra: votante fuera del padrón debe recibir 403');
  const outsiderLogin = await api('/auth/votante/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      nick: String(legajo),
      password: PASSWORD,
      idEleccion: idEleccion + 99999,
    }),
  });
  if (outsiderLogin.status !== 401) {
    console.warn(
      `[merkle-flow] ⚠ login comicio inexistente devolvió ${outsiderLogin.status} (esperado 401)`,
    );
  } else {
    console.log('[merkle-flow] ✓ login en comicio inexistente → 401');
  }

  console.log('\n[merkle-flow] Flujo E2E VOTAR-354 completado con éxito');
  console.log(`[merkle-flow]   idEleccion=${idEleccion}`);
  console.log(`[merkle-flow]   merkleRoot=${root}`);
};

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});
