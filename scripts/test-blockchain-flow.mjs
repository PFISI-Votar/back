#!/usr/bin/env node
import { config } from 'dotenv';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ethers } from 'ethers';

const backRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
config({ path: resolve(backRoot, '.env') });
const blockchainEnvPath = resolve(backRoot, '.env.blockchain.local');
if (existsSync(blockchainEnvPath)) {
  config({ path: blockchainEnvPath, override: true });
}

const PORT = process.env.PORT ?? 3000;
const BASE = `http://localhost:${PORT}`;

const log = (step, detail = '') => {
  console.log(`\n[flow] ${step}${detail ? `: ${detail}` : ''}`);
};

const fail = (message) => {
  console.error(`[flow] ERROR: ${message}`);
  process.exit(1);
};

const getCookieHeader = (response) => {
  const raw = response.headers.getSetCookie?.() ?? [];
  if (raw.length > 0) {
    return raw.map((cookie) => cookie.split(';')[0]).join('; ');
  }
  const single = response.headers.get('set-cookie');
  return single ? single.split(',').map((c) => c.split(';')[0].trim()).join('; ') : '';
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

const main = async () => {
  log('1/6 Login admin UTN');
  const login = await api('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      nick: process.env.DEV_ADMIN_NICK,
      password: process.env.DEV_ADMIN_PASSWORD,
    }),
  });
  if (!login.response.ok) {
    fail(`login ${login.response.status} — ${JSON.stringify(login.body)}`);
  }
  const cookies = getCookieHeader(login.response);
  if (!cookies) {
    fail('login no devolvió cookies de sesión');
  }
  console.log(`[flow] ✓ ${login.body.user?.name} (${login.body.user?.role})`);

  log('2/6 Crear comicio');
  const fechaInicio = new Date(Date.now() + 86400000).toISOString();
  const fechaFin = new Date(Date.now() + 172800000).toISOString();
  const create = await api(
    '/elecciones',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nombre: 'Comicio CLI Blockchain Test',
        fechaInicio,
        fechaFin,
        tipoVotacion: 'POR_LISTA',
        metodosAutenticacion: ['SSO_INSTITUCIONAL'],
      }),
    },
    cookies,
  );
  if (!create.response.ok) {
    fail(`crear comicio ${create.response.status} — ${JSON.stringify(create.body)}`);
  }
  const idEleccion = create.body.idEleccion;
  console.log(`[flow] ✓ idEleccion=${idEleccion}`);

  log('3/6 Importar padrón CSV');
  const csv = readFileSync('/tmp/padron-test.csv');
  const form = new FormData();
  form.append('file', new Blob([csv], { type: 'text/csv' }), 'padron.csv');
  const imported = await api(`/elecciones/${idEleccion}/padron/import`, {
    method: 'POST',
    body: form,
  }, cookies);
  if (!imported.response.ok) {
    fail(`importar padrón ${imported.response.status} — ${JSON.stringify(imported.body)}`);
  }
  console.log(`[flow] ✓ ${imported.body.totalProcesados ?? imported.body.totalVotantes ?? '?'} votantes`);

  log('4/6 Consultar Merkle');
  const merkle = await api(`/elecciones/${idEleccion}/padron/merkle`, {}, cookies);
  if (!merkle.response.ok) {
    fail(`merkle ${merkle.response.status} — ${JSON.stringify(merkle.body)}`);
  }
  if (merkle.body.estado !== 'GENERADO') {
    fail(`merkle en estado ${merkle.body.estado}, se esperaba GENERADO`);
  }
  const merkleRoot = merkle.body.merkleRoot;
  console.log(`[flow] ✓ root=${merkleRoot}`);

  log('5/6 Publicar Merkle on-chain');
  const publish = await api(
    `/elecciones/${idEleccion}/padron/merkle/publicar`,
    { method: 'POST' },
    cookies,
  );
  if (!publish.response.ok) {
    fail(`publicar ${publish.response.status} — ${JSON.stringify(publish.body)}`);
  }
  console.log(`[flow] ✓ txHash=${publish.body.txHash}`);
  console.log(`[flow]   block=${publish.body.numeroBloque}`);
  console.log(`[flow]   contrato=${publish.body.direccionContrato}`);

  log('6/6 Verificar on-chain (Hardhat)');
  const rpc = process.env.SEPOLIA_RPC_URL ?? 'http://127.0.0.1:8545';
  const contractAddress = process.env.MERKLE_ROOT_STORE_ADDRESS;
  if (!contractAddress) {
    fail('MERKLE_ROOT_STORE_ADDRESS no configurada');
  }
  const provider = new ethers.JsonRpcProvider(rpc);
  const abi = [
    'function isPublished(uint256 electionId) view returns (bool)',
    'function getMerkleRoot(uint256 electionId) view returns (bytes32 root, uint256 timestamp)',
  ];
  const contract = new ethers.Contract(contractAddress, abi, provider);
  const isPublished = await contract.isPublished(idEleccion);
  const [onChainRoot] = await contract.getMerkleRoot(idEleccion);
  if (!isPublished) {
    fail('isPublished=false en el contrato');
  }
  if (onChainRoot.toLowerCase() !== merkleRoot.toLowerCase()) {
    fail(`root on-chain ${onChainRoot} != off-chain ${merkleRoot}`);
  }
  console.log(`[flow] ✓ publicado on-chain, root coincide`);

  console.log('\n[flow] Flujo E2E blockchain completado con éxito');
};

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});
