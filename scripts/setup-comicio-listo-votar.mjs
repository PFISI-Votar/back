#!/usr/bin/env node
/**
 * Crea un comicio listo para votar: oferta electoral oficializada + padrón con el admin/votante real.
 */
import { config } from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

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
  console.log(`\n[setup] ${step}${detail ? `: ${detail}` : ''}`);
};

const fail = (message) => {
  console.error(`[setup] ERROR: ${message}`);
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
  return { response, body, status: response.status, ok: response.ok };
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
  const loginRes = await fetch(`${AUTOGESTION_BASE}/login`, {
    method: 'POST',
    headers: { Accept: '*/*', nick: NICK, password: PASSWORD },
  });
  if (!loginRes.ok) {
    fail(`Autogestión login ${loginRes.status}`);
  }
  const loginData = await loginRes.json();
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
  const dni = resolveDni(persona);
  const email = (persona.email ?? persona.mail ?? '').trim().toLowerCase();
  if (!dni || !email) {
    fail('No se pudo resolver dni/email desde Autogestión');
  }
  return {
    dni,
    email,
    legajo: String(persona.legajo ?? NICK),
    nombre: [persona.nombre, persona.apellido].filter(Boolean).join(' '),
  };
};

const main = async () => {
  if (!NICK || !PASSWORD) {
    fail('Configurá DEV_ADMIN_NICK y DEV_ADMIN_PASSWORD en .env');
  }

  log('0/8 Identidad del votante (Autogestión)');
  const votante = await fetchAutogestionPersona();
  console.log(
    `[setup] ✓ ${votante.nombre} — legajo ${votante.legajo}, dni ${votante.dni}`,
  );

  log('1/8 Login admin');
  const adminLogin = await api('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nick: NICK, password: PASSWORD }),
  });
  if (!adminLogin.ok) {
    fail(`admin login ${adminLogin.status} — ${JSON.stringify(adminLogin.body)}`);
  }
  const cookies = getCookieHeader(adminLogin.response);
  console.log(`[setup] ✓ ${adminLogin.body.user?.name}`);

  log('2/8 Crear comicio');
  const suffix = Date.now();
  const fechaInicio = new Date(Date.now() + 86400000).toISOString();
  const fechaFin = new Date(Date.now() + 172800000).toISOString();
  const create = await api(
    '/elecciones',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nombre: `Comicio prueba Merkle ${suffix}`,
        descripcion: 'Comicio creado por setup-comicio-listo-votar.mjs',
        fechaInicio,
        fechaFin,
        tipoVotacion: 'POR_LISTA',
        metodosAutenticacion: ['SSO_INSTITUCIONAL'],
      }),
    },
    cookies,
  );
  if (!create.ok) {
    fail(`crear comicio ${create.status} — ${JSON.stringify(create.body)}`);
  }
  const idEleccion = create.body.idEleccion;
  console.log(`[setup] ✓ idEleccion=${idEleccion}`);

  log('3/8 Categoría + listas + candidatos');
  const categoria = await api(
    `/elecciones/${idEleccion}/categorias`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nombre: 'Presidente',
        maximoPostulantes: 1,
        minimoPostulantes: 0,
      }),
    },
    cookies,
  );
  if (!categoria.ok) {
    fail(`crear categoría ${categoria.status} — ${JSON.stringify(categoria.body)}`);
  }
  const idCategoria = categoria.body.idCategoria;

  const listasSpec = [
    { nombre: 'Lista Azul', sigla: 'LAZ', color: '#2563eb' },
    { nombre: 'Lista Verde', sigla: 'LVE', color: '#16a34a' },
  ];
  for (const spec of listasSpec) {
    const lista = await api(
      `/elecciones/${idEleccion}/listas`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(spec),
      },
      cookies,
    );
    if (!lista.ok) {
      fail(`crear lista ${lista.status} — ${JSON.stringify(lista.body)}`);
    }
    const candidato = await api(
      `/listas/${lista.body.idLista}/candidatos`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: 'Candidato',
          apellido: spec.sigla,
          idCategoria,
          datosAdicionales: {},
        }),
      },
      cookies,
    );
    if (!candidato.ok) {
      fail(`crear candidato ${candidato.status} — ${JSON.stringify(candidato.body)}`);
    }
  }
  console.log('[setup] ✓ 2 listas con 1 candidato cada una');

  log('4/8 Importar padrón');
  const csv = `dni,email\n${votante.dni},${votante.email}\n30111222,otro.votante@frvm.utn.edu.ar`;
  const form = new FormData();
  form.append('file', new Blob([csv], { type: 'text/csv' }), 'padron.csv');
  const imported = await api(
    `/elecciones/${idEleccion}/padron/import`,
    { method: 'POST', body: form },
    cookies,
  );
  if (!imported.ok) {
    fail(`importar padrón ${imported.status} — ${JSON.stringify(imported.body)}`);
  }
  console.log(
    `[setup] ✓ ${imported.body.totalProcesados ?? imported.body.totalVotantes ?? 2} votantes, Merkle GENERADO`,
  );

  log('5/8 Oficializar oferta electoral');
  const oficializar = await api(
    `/elecciones/${idEleccion}/oficializar`,
    { method: 'POST' },
    cookies,
  );
  if (!oficializar.ok) {
    fail(`oficializar ${oficializar.status} — ${JSON.stringify(oficializar.body)}`);
  }
  console.log(`[setup] ✓ estado=${oficializar.body.estado}`);

  log('6/8 Verificar Merkle');
  const merkle = await api(
    `/elecciones/${idEleccion}/padron/merkle`,
    {},
    cookies,
  );
  if (!merkle.ok || merkle.body.estado !== 'GENERADO') {
    fail(`merkle inválido — ${JSON.stringify(merkle.body)}`);
  }
  console.log(`[setup] ✓ root=${merkle.body.merkleRoot}`);

  log('7/8 Login votante + merkle-proof');
  const voterLogin = await api('/auth/votante/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      nick: votante.legajo,
      password: PASSWORD,
      idEleccion,
    }),
  });
  if (!voterLogin.ok) {
    fail(`votante login ${voterLogin.status} — ${JSON.stringify(voterLogin.body)}`);
  }
  const voterCookies = getCookieHeader(voterLogin.response);
  const proof = await api(
    `/elecciones/${idEleccion}/merkle-proof`,
    {},
    voterCookies,
  );
  if (!proof.ok) {
    fail(`merkle-proof ${proof.status} — ${JSON.stringify(proof.body)}`);
  }
  console.log(
    `[setup] ✓ merkle-proof OK (${proof.body.merkleProof?.length ?? 0} hermanos)`,
  );

  log('8/8 Verificar boleta digital');
  const boleta = await api(
    `/elecciones/${idEleccion}/boleta-digital`,
    {},
    voterCookies,
  );
  if (!boleta.ok) {
    fail(`boleta-digital ${boleta.status} — ${JSON.stringify(boleta.body)}`);
  }
  console.log(
    `[setup] ✓ boleta "${boleta.body.titulo ?? boleta.body.nombreComicio}" — ${boleta.body.listas?.length ?? 0} listas`,
  );

  const frontUrl = process.env.FRONTEND_URL ?? 'http://localhost:5173';
  console.log('\n══════════════════════════════════════════════');
  console.log('  COMICIO LISTO PARA VOTAR');
  console.log('══════════════════════════════════════════════');
  console.log(`  idEleccion:  ${idEleccion}`);
  console.log(`  estado:      ${oficializar.body.estado}`);
  console.log(`  votante:     legajo ${votante.legajo}`);
  console.log(`  merkle root: ${merkle.body.merkleRoot}`);
  console.log('');
  console.log(`  BUD:  ${frontUrl}/comicios/${idEleccion}/votar`);
  console.log(`  API:  ${BASE}/elecciones/${idEleccion}/merkle-proof`);
  console.log('══════════════════════════════════════════════\n');
};

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});
