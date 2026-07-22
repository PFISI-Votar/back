/**
 * Helpers for local Hardhat + NestJS blockchain integration in demo/seed scripts.
 */
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Contract, JsonRpcProvider, Wallet } from 'ethers';

export const HARDHAT_RPC_URL = 'http://127.0.0.1:8545';

/** Hardhat account #0 — DEFAULT_ADMIN + ELECTION_ADMIN on local deploy. */
export const HARDHAT_ADMIN_PRIVATE_KEY =
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';

/** Hardhat account #1 — MERKLE_UPDATER on local deploy. */
export const HARDHAT_MERKLE_UPDATER_PRIVATE_KEY =
  '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';

const MERKLE_ROOT_STORE_ABI = [
  'function ELECTION_ADMIN_ROLE() view returns (bytes32)',
  'function MERKLE_UPDATER_ROLE() view returns (bytes32)',
  'function hasRole(bytes32 role, address account) view returns (bool)',
  'function grantRole(bytes32 role, address account)',
  'function publishRoot(uint256 electionId, bytes32 root)',
  'function isPublished(uint256 electionId) view returns (bool)',
  'function getMerkleRoot(uint256 electionId) view returns (bytes32 root, uint256 timestamp)',
];

const backRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const blockchainRoot = resolve(backRoot, '../blockchain');
const blockchainEnvPath = resolve(backRoot, '.env.blockchain.local');

const sleep = (ms) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms));

const parseEnvFile = (filePath) => {
  const values = {};
  if (!existsSync(filePath)) {
    return values;
  }
  for (const line of readFileSync(filePath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }
    values[trimmed.slice(0, separatorIndex)] = trimmed.slice(separatorIndex + 1);
  }
  return values;
};

const writeEnvFile = (filePath, values, headerLines) => {
  const lines = [
    ...headerLines,
    ...Object.entries(values).map(([key, value]) => `${key}=${value}`),
    '',
  ];
  const directory = dirname(filePath);
  if (!existsSync(directory)) {
    mkdirSync(directory, { recursive: true });
  }
  writeFileSync(filePath, lines.join('\n'), 'utf8');
};

/**
 * Merges missing local Hardhat keys into `.env.blockchain.local`.
 * @returns {boolean} true when the file was created or updated
 */
export const mergeLocalBlockchainEnv = () => {
  const existing = parseEnvFile(blockchainEnvPath);
  const merged = {
    ...existing,
    SEPOLIA_RPC_URL: existing.SEPOLIA_RPC_URL ?? HARDHAT_RPC_URL,
    ELECTION_ADMIN_PRIVATE_KEY:
      existing.ELECTION_ADMIN_PRIVATE_KEY ?? HARDHAT_ADMIN_PRIVATE_KEY,
    MERKLE_UPDATER_PRIVATE_KEY:
      existing.MERKLE_UPDATER_PRIVATE_KEY ?? HARDHAT_MERKLE_UPDATER_PRIVATE_KEY,
  };
  const changed =
    !existsSync(blockchainEnvPath) ||
    merged.ELECTION_ADMIN_PRIVATE_KEY !== existing.ELECTION_ADMIN_PRIVATE_KEY ||
    merged.MERKLE_UPDATER_PRIVATE_KEY !== existing.MERKLE_UPDATER_PRIVATE_KEY ||
    merged.SEPOLIA_RPC_URL !== existing.SEPOLIA_RPC_URL;
  if (!changed) {
    return false;
  }
  writeEnvFile(blockchainEnvPath, merged, [
    '# Generado/actualizado por scripts/lib/local-blockchain.mjs',
    '# No commitear — reiniciá Hardhat (`npm run dev` en blockchain/) si reiniciás el nodo.',
  ]);
  return true;
};

/**
 * Resolves the election-admin private key the backend uses (`.env` then `.env.blockchain.local` override).
 */
export const resolveBackendElectionAdminKey = (env = process.env) => {
  const dotEnv = parseEnvFile(resolve(backRoot, '.env'));
  const blockchainEnv = parseEnvFile(blockchainEnvPath);
  return (
    blockchainEnv.ELECTION_ADMIN_PRIVATE_KEY ??
    env.ELECTION_ADMIN_PRIVATE_KEY ??
    dotEnv.ELECTION_ADMIN_PRIVATE_KEY ??
    HARDHAT_ADMIN_PRIVATE_KEY
  );
};

/**
 * Keys that a running Nest process may use for ELECTION_ADMIN (startup order:
 * `.env` then `.env.blockchain.local` overrides). Grants must cover every candidate.
 */
export const resolveElectionAdminGrantTargets = () => {
  const dotEnv = parseEnvFile(resolve(backRoot, '.env'));
  const blockchainEnv = parseEnvFile(blockchainEnvPath);
  const keys = [
    dotEnv.ELECTION_ADMIN_PRIVATE_KEY,
    blockchainEnv.ELECTION_ADMIN_PRIVATE_KEY,
    HARDHAT_ADMIN_PRIVATE_KEY,
  ].filter(Boolean);
  const unique = [];
  const seen = new Set();
  for (const key of keys) {
    const address = new Wallet(key).address.toLowerCase();
    if (seen.has(address)) {
      continue;
    }
    seen.add(address);
    unique.push(key);
  }
  return unique;
};

const MIN_ELECTION_ADMIN_BALANCE_WEI = 10n ** 17n;

/**
 * Sends local Hardhat ETH to election-admin wallets so the backend can pay gas.
 */
export const fundElectionAdminWallets = async ({
  provider,
  onLog = () => {},
}) => {
  const funder = new Wallet(HARDHAT_ADMIN_PRIVATE_KEY, provider);
  for (const key of resolveElectionAdminGrantTargets()) {
    const target = new Wallet(key, provider);
    if (target.address.toLowerCase() === funder.address.toLowerCase()) {
      continue;
    }
    const balance = await provider.getBalance(target.address);
    if (balance >= MIN_ELECTION_ADMIN_BALANCE_WEI) {
      onLog(`Saldo OK en ${target.address}`);
      continue;
    }
    onLog(`Fondeando ${target.address} desde Hardhat admin (gas local)`);
    const tx = await funder.sendTransaction({
      to: target.address,
      value: MIN_ELECTION_ADMIN_BALANCE_WEI,
    });
    await tx.wait(1);
  }
};

export const waitForRpc = async (rpcUrl = HARDHAT_RPC_URL, attempts = 30) => {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const provider = new JsonRpcProvider(rpcUrl);
      await provider.getBlockNumber();
      return provider;
    } catch {
      if (attempt === attempts) {
        throw new Error(
          `Hardhat RPC no responde en ${rpcUrl} — levantá npm run dev en blockchain/`,
        );
      }
      await sleep(500);
    }
  }
  throw new Error(`Hardhat RPC no responde en ${rpcUrl}`);
};

export const getContractBytecode = async (provider, address) => {
  if (!address) {
    return '0x';
  }
  return provider.getCode(address);
};

const runCommand = (command, args, cwd) =>
  new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolvePromise();
        return;
      }
      reject(
        new Error(`${command} ${args.join(' ')} falló con código de salida ${code}`),
      );
    });
  });

export const runLocalDeploy = async () => {
  await runCommand(
    'npx',
    ['hardhat', 'run', 'scripts/deploy-local.ts', '--network', 'localhost'],
    blockchainRoot,
  );
};

/**
 * Ensures MerkleRootStore is deployed and `.env.blockchain.local` is populated.
 * @returns {{ redeployed: boolean, envPatched: boolean, storeAddress: string }}
 */
export const ensureLocalBlockchain = async ({
  onLog = () => {},
} = {}) => {
  const envPatched = mergeLocalBlockchainEnv();
  if (envPatched) {
    onLog('Actualizado .env.blockchain.local con claves Hardhat locales');
  }

  const provider = await waitForRpc();
  let storeAddress =
    parseEnvFile(blockchainEnvPath).MERKLE_ROOT_STORE_ADDRESS ??
    process.env.MERKLE_ROOT_STORE_ADDRESS;

  let bytecode = await getContractBytecode(provider, storeAddress);
  let redeployed = false;
  if (!storeAddress || bytecode === '0x') {
    onLog('Contrato MerkleRootStore no encontrado — ejecutando deploy-local...');
    await runLocalDeploy();
    redeployed = true;
    storeAddress = parseEnvFile(blockchainEnvPath).MERKLE_ROOT_STORE_ADDRESS;
    bytecode = await getContractBytecode(provider, storeAddress);
    if (!storeAddress || bytecode === '0x') {
      throw new Error('deploy-local no dejó MERKLE_ROOT_STORE_ADDRESS desplegado');
    }
    onLog(`Deploy OK — MerkleRootStore=${storeAddress}`);
  }

  return { redeployed, envPatched, storeAddress, provider };
};

/**
 * Grants ELECTION_ADMIN_ROLE on local MerkleRootStore to every wallet the backend may use.
 */
export const ensureBackendElectionAdminRole = async ({
  storeAddress,
  provider,
  onLog = () => {},
}) => {
  const adminWallet = new Wallet(HARDHAT_ADMIN_PRIVATE_KEY, provider);
  const store = new Contract(storeAddress, MERKLE_ROOT_STORE_ABI, adminWallet);
  const role = await store.ELECTION_ADMIN_ROLE();
  const granted = [];
  for (const key of resolveElectionAdminGrantTargets()) {
    const backendWallet = new Wallet(key, provider);
    const hasRole = await store.hasRole(role, backendWallet.address);
    if (hasRole) {
      onLog(`ELECTION_ADMIN_ROLE OK para ${backendWallet.address}`);
      granted.push(backendWallet.address);
      continue;
    }
    onLog(
      `Otorgando ELECTION_ADMIN_ROLE on-chain a ${backendWallet.address}`,
    );
    const tx = await store.grantRole(role, backendWallet.address);
    await tx.wait(1);
    granted.push(backendWallet.address);
  }
  return granted;
};

export const fetchMerkleRootFromApi = async (baseUrl, idEleccion, cookies) => {
  const response = await fetch(`${baseUrl}/elecciones/${idEleccion}/padron/merkle`, {
    headers: cookies ? { Cookie: cookies } : {},
  });
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!response.ok) {
    throw new Error(
      `GET merkle ${response.status}: ${JSON.stringify(body)}`,
    );
  }
  return body.merkleRoot;
};

export const verifyMerkleOnChain = async ({
  provider,
  storeAddress,
  idEleccion,
  expectedRoot,
}) => {
  const store = new Contract(storeAddress, MERKLE_ROOT_STORE_ABI, provider);
  const isPublished = await store.isPublished(idEleccion);
  if (!isPublished) {
    return { ok: false, reason: 'not_published' };
  }
  const [onChainRoot] = await store.getMerkleRoot(idEleccion);
  if (onChainRoot.toLowerCase() !== expectedRoot.toLowerCase()) {
    return { ok: false, reason: 'root_mismatch', onChainRoot };
  }
  return { ok: true };
};

export const republishMerkleOnChain = async ({
  provider,
  storeAddress,
  idEleccion,
  merkleRoot,
  onLog = () => {},
}) => {
  const updater = new Wallet(HARDHAT_MERKLE_UPDATER_PRIVATE_KEY, provider);
  const store = new Contract(storeAddress, MERKLE_ROOT_STORE_ABI, updater);
  onLog(`Republicando Merkle on-chain comicio=${idEleccion}`);
  const tx = await store.publishRoot(idEleccion, merkleRoot);
  const receipt = await tx.wait(1);
  onLog(`Merkle republicado tx=${receipt.hash}`);
  return receipt.hash;
};

/**
 * Verifies Merkle on-chain; republishes when Hardhat state was reset.
 */
export const ensureMerkleOnChain = async ({
  baseUrl,
  idEleccion,
  cookies,
  storeAddress,
  provider,
  onLog = () => {},
}) => {
  const merkleRoot = await fetchMerkleRootFromApi(baseUrl, idEleccion, cookies);
  const verification = await verifyMerkleOnChain({
    provider,
    storeAddress,
    idEleccion,
    expectedRoot: merkleRoot,
  });
  if (verification.ok) {
    onLog(`Merkle verificado on-chain comicio=${idEleccion}`);
    return merkleRoot;
  }
  if (verification.reason === 'root_mismatch') {
    throw new Error(
      `Raíz Merkle distinta on-chain (${verification.onChainRoot}) vs backend (${merkleRoot}). ` +
        'Reiniciá el backend tras redeploy o borrá el comicio.',
    );
  }
  await republishMerkleOnChain({
    provider,
    storeAddress,
    idEleccion,
    merkleRoot,
    onLog,
  });
  return merkleRoot;
};
