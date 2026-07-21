#!/usr/bin/env node
/** Completa seed + cierre para un comicio ABIERTA (uso interno tras fallo de nonce). */
import { config } from 'dotenv';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Contract, JsonRpcProvider, Wallet } from 'ethers';

const backRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
config({ path: resolve(backRoot, '.env') });
if (existsSync(resolve(backRoot, '.env.blockchain.local'))) {
  config({ path: resolve(backRoot, '.env.blockchain.local'), override: true });
}

const idEleccion = Number(process.argv[2] ?? 0);
const candidateIds = (process.argv[3] ?? '').split(',').map(Number).filter(Boolean);
if (!idEleccion || candidateIds.length < 2) {
  console.error('Uso: node scripts/finish-votar-369-uat.mjs <idEleccion> <idCandidatoA,idCandidatoB>');
  process.exit(1);
}

const PORT = process.env.PORT ?? 8000;
const BASE = `http://localhost:${PORT}`;
const FRONT = process.env.FRONTEND_URL ?? 'http://localhost:5173';
const NICK = process.env.DEV_ADMIN_NICK?.trim();
const PASSWORD = process.env.DEV_ADMIN_PASSWORD?.trim();
const RPC = process.env.SEPOLIA_RPC_URL ?? 'http://127.0.0.1:8545';
const REGISTRY = process.env.VOTE_REGISTRY_ADDRESS;
const ADMIN_KEY =
  process.env.ELECTION_ADMIN_PRIVATE_KEY ??
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const SEEDER_KEY =
  process.env.MERKLE_UPDATER_PRIVATE_KEY ??
  '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';

const TARGET = { a: 7, b: 4, blanco: 2, nulo: 1 };

const getCookieHeader = (response) => {
  const raw = response.headers.getSetCookie?.() ?? [];
  if (raw.length) return raw.map((c) => c.split(';')[0]).join('; ');
  const single = response.headers.get('set-cookie');
  return single
    ? single.split(',').map((c) => c.split(';')[0].trim()).join('; ')
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
  return { body, status: response.status, ok: response.ok, response };
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const randomVoterHash = () => `0x${randomBytes(32).toString('hex')}`;

const main = async () => {
  const login = await api('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nick: NICK, password: PASSWORD }),
  });
  const cookies = getCookieHeader(login.response);
  const provider = new JsonRpcProvider(RPC);
  const adminWallet = new Wallet(ADMIN_KEY, provider);
  const seederWallet = new Wallet(SEEDER_KEY, provider);
  const readRegistry = new Contract(
    REGISTRY,
    [
      'function BALLOT_ROLE() view returns (bytes32)',
      'function grantRole(bytes32 role, address account)',
      'function hasRole(bytes32 role, address account) view returns (bool)',
      'function recordVote(uint256 electionId, bytes32 voterHash, uint256 candidateId)',
      'function getTally(uint256 electionId, uint256 candidateId) view returns (uint256)',
      'function getParticipationStats(uint256 electionId) view returns (uint256,uint256,uint256)',
      'function VOTO_BLANCO() view returns (uint256)',
      'function VOTO_NULO() view returns (uint256)',
    ],
    provider,
  );
  const [candA, candB] = candidateIds;
  const blancoId = await readRegistry.VOTO_BLANCO();
  const nuloId = await readRegistry.VOTO_NULO();
  const tallyA = Number(await readRegistry.getTally(idEleccion, candA));
  const tallyB = Number(await readRegistry.getTally(idEleccion, candB));
  const [, currentBlank, currentNull] =
    await readRegistry.getParticipationStats(idEleccion);
  const votesToCast = [
    ...Array.from({ length: Math.max(0, TARGET.a - tallyA) }, () => BigInt(candA)),
    ...Array.from({ length: Math.max(0, TARGET.b - tallyB) }, () => BigInt(candB)),
    ...Array.from(
      { length: Math.max(0, TARGET.blanco - Number(currentBlank)) },
      () => blancoId,
    ),
    ...Array.from(
      { length: Math.max(0, TARGET.nulo - Number(currentNull)) },
      () => nuloId,
    ),
  ];
  if (votesToCast.length > 0) {
    const ballotRole = await readRegistry.BALLOT_ROLE();
    if (!(await readRegistry.hasRole(ballotRole, seederWallet.address))) {
      const adminRegistry = readRegistry.connect(adminWallet);
      const grantTx = await adminRegistry.grantRole(
        ballotRole,
        seederWallet.address,
      );
      await grantTx.wait(1);
      await sleep(500);
    }
    const writeRegistry = readRegistry.connect(seederWallet);
    let nonce = await provider.getTransactionCount(
      seederWallet.address,
      'pending',
    );
    for (const candidateId of votesToCast) {
      const tx = await writeRegistry.recordVote(
        idEleccion,
        randomVoterHash(),
        candidateId,
        { nonce },
      );
      await tx.wait(1);
      nonce += 1;
    }
  }
  const cerrar = await api(
    `/elecciones/${idEleccion}/cerrar`,
    { method: 'POST' },
    cookies,
  );
  if (!cerrar.ok) throw new Error(JSON.stringify(cerrar.body));
  const resultados = await api(`/elecciones/${idEleccion}/resultados`);
  console.log(`
Comicio ${idEleccion} cerrado.
Dashboard: ${FRONT}/comicios/${idEleccion}/dashboard/resultados
Estado: ${resultados.body?.estado}
Total votos: ${resultados.body?.participacion?.totalVotos}
Candidato A (${candA}): ${resultados.body?.candidatos?.find((c) => c.idCandidato === candA)?.votos ?? '?'}
Candidato B (${candB}): ${resultados.body?.candidatos?.find((c) => c.idCandidato === candB)?.votos ?? '?'}
`);
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
