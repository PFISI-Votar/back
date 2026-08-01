#!/usr/bin/env node
/**
 * VOTAR-364 — Prepara un comicio ABIERTA con tallies on-chain para el Dashboard.
 *
 * Uso (con API + Hardhat ya levantados):
 *   node scripts/prepare-votar-364-uat.mjs
 */
import { config } from 'dotenv';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Contract, JsonRpcProvider, Wallet } from 'ethers';

const backRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
config({ path: resolve(backRoot, '.env') });
const blockchainEnvPath = resolve(backRoot, '.env.blockchain.local');
if (existsSync(blockchainEnvPath)) {
  config({ path: blockchainEnvPath, override: true });
}

const PORT = process.env.PORT ?? 3000;
const BASE = `http://localhost:${PORT}`;
const FRONT = process.env.FRONTEND_URL ?? 'http://localhost:5173';
const NICK = process.env.DEV_ADMIN_NICK?.trim();
const PASSWORD = process.env.DEV_ADMIN_PASSWORD?.trim();
const RPC = process.env.SEPOLIA_RPC_URL ?? 'http://127.0.0.1:8545';
const REGISTRY = process.env.VOTE_REGISTRY_ADDRESS;
const ADMIN_KEY =
  process.env.ELECTION_ADMIN_PRIVATE_KEY ??
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';

const VOTE_REGISTRY_ABI = [
  'function BALLOT_ROLE() view returns (bytes32)',
  'function DEFAULT_ADMIN_ROLE() view returns (bytes32)',
  'function grantRole(bytes32 role, address account)',
  'function hasRole(bytes32 role, address account) view returns (bool)',
  'function recordVote(uint256 electionId, bytes32 voterHash, uint256 candidateId)',
  'function getParticipationStats(uint256 electionId) view returns (uint256,uint256,uint256)',
  'function getTally(uint256 electionId, uint256 candidateId) view returns (uint256)',
  'function VOTO_BLANCO() view returns (uint256)',
  'function VOTO_NULO() view returns (uint256)',
];

const log = (msg) => console.log(`[uat-364] ${msg}`);
const fail = (msg) => {
  console.error(`[uat-364] ERROR: ${msg}`);
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
  return { response, body, status: response.status, ok: response.ok };
};

const fetchPersona = async () => {
  const base =
    process.env.AUTOGESTION_BASE_URL ??
    'https://webservice.frvm.utn.edu.ar/autogestion';
  const loginRes = await fetch(`${base}/login`, {
    method: 'POST',
    headers: { Accept: '*/*', nick: NICK, password: PASSWORD },
  });
  const loginData = await loginRes.json();
  if (!loginRes.ok || !loginData.hashActual) {
    fail('no se pudo obtener persona de Autogestión');
  }
  const auth = Buffer.from(`${NICK}:${loginData.hashActual}`).toString(
    'base64',
  );
  const userRes = await fetch(`${base}/usuarios`, {
    headers: { Accept: '*/*', nick: NICK, Authorization: `Basic ${auth}` },
  });
  const user = await userRes.json();
  const persona = user.persona;
  const dni =
    persona.dni != null
      ? String(persona.dni).replace(/\D/g, '')
      : String(persona.documento?.numero ?? persona.documento ?? '').replace(
          /\D/g,
          '',
        );
  const email = String(persona.email ?? persona.mail ?? '')
    .trim()
    .toLowerCase();
  if (!dni || !email) fail('dni/email incompletos desde Autogestión');
  return {
    dni,
    email,
    nombre: `${persona.nombre ?? ''} ${persona.apellido ?? ''}`.trim(),
  };
};

const randomVoterHash = () => `0x${randomBytes(32).toString('hex')}`;

const seedOnChainTallies = async ({ idEleccion, candidateIds }) => {
  if (!REGISTRY) fail('VOTE_REGISTRY_ADDRESS no configurado');
  const provider = new JsonRpcProvider(RPC);
  const wallet = new Wallet(ADMIN_KEY, provider);
  const registry = new Contract(REGISTRY, VOTE_REGISTRY_ABI, wallet);
  const ballotRole = await registry.BALLOT_ROLE();
  const hasRole = await registry.hasRole(ballotRole, wallet.address);
  if (!hasRole) {
    log(`Concediendo BALLOT_ROLE a ${wallet.address} para seed de demos`);
    const tx = await registry.grantRole(ballotRole, wallet.address);
    await tx.wait(1);
  }

  const [candA, candB] = candidateIds;
  const blancoId = await registry.VOTO_BLANCO();
  const nuloId = await registry.VOTO_NULO();
  const votes = [
    ...Array.from({ length: 7 }, () => ({ candidateId: BigInt(candA) })),
    ...Array.from({ length: 4 }, () => ({ candidateId: BigInt(candB) })),
    ...Array.from({ length: 2 }, () => ({ candidateId: blancoId })),
    { candidateId: nuloId },
  ];

  for (const vote of votes) {
    const tx = await registry.recordVote(
      idEleccion,
      randomVoterHash(),
      vote.candidateId,
    );
    await tx.wait(1);
  }

  const [total, blank, nullVotes] =
    await registry.getParticipationStats(idEleccion);
  const tallyA = await registry.getTally(idEleccion, BigInt(candA));
  const tallyB = await registry.getTally(idEleccion, BigInt(candB));
  return {
    total: Number(total),
    blank: Number(blank),
    nullVotes: Number(nullVotes),
    tallyA: Number(tallyA),
    tallyB: Number(tallyB),
  };
};

const main = async () => {
  if (!NICK || !PASSWORD) {
    fail('DEV_ADMIN_NICK / DEV_ADMIN_PASSWORD requeridos en .env');
  }

  log('1) Healthcheck API');
  const health = await api('/api/docs');
  if (health.status === 0 || health.status >= 500) {
    fail(`API no responde en ${BASE} — levantá npm run dev en back/`);
  }

  log('2) Login admin');
  const login = await api('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nick: NICK, password: PASSWORD }),
  });
  if (!login.ok) {
    fail(`login ${login.status}: ${JSON.stringify(login.body)}`);
  }
  const cookies = getCookieHeader(login.response);

  log('3) Identidad padrón (Autogestión)');
  const persona = await fetchPersona();
  log(`   ${persona.nombre} — DNI ${persona.dni}`);

  log('4) Crear comicio');
  const fechaInicio = new Date(Date.now() + 120_000).toISOString();
  const fechaFin = new Date(Date.now() + 7 * 86400_000).toISOString();
  const create = await api(
    '/elecciones',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nombre: `UAT VOTAR-364 Resultados ${new Date().toISOString().slice(0, 16)}`,
        descripcion:
          'Comicio de prueba para visualización dinámica del escrutinio',
        fechaInicio,
        fechaFin,
        tipoVotacion: 'POR_LISTA',
        metodosAutenticacion: ['SSO_INSTITUCIONAL'],
      }),
    },
    cookies,
  );
  if (!create.ok) {
    fail(`crear ${create.status}: ${JSON.stringify(create.body)}`);
  }
  const idEleccion = create.body.idEleccion;
  log(`   idEleccion=${idEleccion}`);

  log('5) Categoría + 2 listas + candidatos');
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
  if (!cat.ok) fail(`categoria ${cat.status}: ${JSON.stringify(cat.body)}`);
  const idCategoria = cat.body.idCategoria;

  const listaA = await api(
    `/elecciones/${idEleccion}/listas`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nombre: 'Lista Azul',
        sigla: 'LA',
        color: '#2f6f9f',
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
        nombre: 'Lista Verde',
        sigla: 'LV',
        color: '#16a34a',
      }),
    },
    cookies,
  );
  if (!listaA.ok || !listaB.ok) {
    fail(
      `listas: ${JSON.stringify(listaA.body)} / ${JSON.stringify(listaB.body)}`,
    );
  }

  const candidateIds = [];
  for (const [lista, candidato] of [
    [listaA.body, { nombre: 'Ana', apellido: 'Lopez' }],
    [listaB.body, { nombre: 'Bruno', apellido: 'Paz' }],
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
          orden: 1,
          datosAdicionales: {},
        }),
      },
      cookies,
    );
    if (!cand.ok) {
      fail(`candidato ${cand.status}: ${JSON.stringify(cand.body)}`);
    }
    candidateIds.push(cand.body.idCandidato);
  }
  log(`   candidatos=${candidateIds.join(', ')}`);

  log('6) Importar padrón');
  const csv = `dni,email\n${persona.dni},${persona.email}\n30111222,ana@frvm.utn.edu.ar\n30222333,bruno@frvm.utn.edu.ar\n30333444,carla@frvm.utn.edu.ar\n`;
  const form = new FormData();
  form.append(
    'file',
    new Blob([csv], { type: 'text/csv' }),
    'padron-uat-364.csv',
  );
  const imported = await api(
    `/elecciones/${idEleccion}/padron/import`,
    { method: 'POST', body: form },
    cookies,
  );
  if (!imported.ok) {
    fail(`padron ${imported.status}: ${JSON.stringify(imported.body)}`);
  }

  log('7) Oficializar');
  const ofic = await api(
    `/elecciones/${idEleccion}/oficializar`,
    { method: 'POST' },
    cookies,
  );
  if (!ofic.ok) {
    fail(`oficializar ${ofic.status}: ${JSON.stringify(ofic.body)}`);
  }

  log('8) Publicar Merkle on-chain');
  const publish = await api(
    `/elecciones/${idEleccion}/padron/merkle/publicar`,
    { method: 'POST' },
    cookies,
  );
  if (!publish.ok) {
    fail(`publicar ${publish.status}: ${JSON.stringify(publish.body)}`);
  }
  log(`   tx=${publish.body.txHash ?? publish.body.txHashPublicacion}`);

  log('9) Abrir comicio (activa mostrarResultadosTiempoReal)');
  const abrir = await api(
    `/elecciones/${idEleccion}/abrir`,
    { method: 'POST' },
    cookies,
  );
  if (!abrir.ok) {
    fail(`abrir ${abrir.status}: ${JSON.stringify(abrir.body)}`);
  }
  log(`   estado=${abrir.body.estado}`);

  log('10) Sembrar tallies on-chain (14 votos demo)');
  const seeded = await seedOnChainTallies({
    idEleccion,
    candidateIds,
  });
  log(
    `   total=${seeded.total} A=${seeded.tallyA} B=${seeded.tallyB} blanco=${seeded.blank} nulo=${seeded.nullVotes}`,
  );

  log('11) Verificar endpoint público /resultados');
  // small wait for poller/cache cold path
  await new Promise((r) => setTimeout(r, 500));
  const resultados = await api(`/elecciones/${idEleccion}/resultados`);
  if (!resultados.ok) {
    fail(`resultados ${resultados.status}: ${JSON.stringify(resultados.body)}`);
  }

  console.log(`
============================================================
Comicio listo — VOTAR-364 Visualización de resultados
============================================================
Dashboard:   ${FRONT}/comicios/${idEleccion}/dashboard/resultados
Resumen:     ${FRONT}/comicios/${idEleccion}/dashboard
API:         ${BASE}/elecciones/${idEleccion}/resultados
idEleccion:  ${idEleccion}
estado:      ${abrir.body.estado}
tallies:     total=${seeded.total} | A=${seeded.tallyA} | B=${seeded.tallyB} | blanco=${seeded.blank} | nulo=${seeded.nullVotes}
candidatos:  ${candidateIds.join(', ')}
AuditView:   ${process.env.AUDIT_VIEW_ADDRESS ?? '(fallback registry)'}
============================================================
Abrí el Dashboard: los gráficos deberían mostrar los votos
sin login. Si votás desde la BUD, en ≤5s se actualizan.
============================================================
`);
};

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});
