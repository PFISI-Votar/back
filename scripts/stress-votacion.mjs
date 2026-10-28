#!/usr/bin/env node
/**
 * VOTAR-520 — Stress-test de votación con N votantes sintéticos.
 *
 * Simula el flujo completo de sufragio de un padrón ficticio (por defecto 1000
 * votantes) repartiendo las llegadas en una ventana de tiempo configurable, y
 * verifica que todos los votos queden registrados.
 *
 * Flujo por votante (espejo del front):
 *   login SSO → boleta-digital → merkle-proof → credencial (commit)
 *   → autorizacion relayer → [anónimo] firma de validación → [anónimo] cast
 *
 * Subcomandos:
 *   csv   Genera el CSV del padrón ficticio (importarlo como admin en el comicio).
 *   mock  Levanta una Autogestión falsa (acepta cualquier password de los
 *         votantes sintéticos). Arrancar el backend con
 *         AUTOGESTION_BASE_URL=http://localhost:<puerto> para no pegarle al SSO real.
 *   run   Ejecuta la carga y emite el reporte.
 *
 * Ejemplos:
 *   node scripts/stress-votacion.mjs csv --voters 1000 --out padron-stress.csv
 *   node scripts/stress-votacion.mjs mock --port 4010
 *   node scripts/stress-votacion.mjs run --eleccion 12 --voters 1000 \
 *        --duration-min 30 --rpc http://127.0.0.1:8545 --chain-id 31337
 *   node scripts/stress-votacion.mjs run --eleccion 12 --duration-min 0   # ráfaga
 *
 * Requisitos de `run`: comicio ABIERTO, con el padrón generado por `csv`
 * importado y su Merkle publicado, y rate limits del backend ajustados para el
 * ambiente de prueba (todas las requests salen de la misma IP).
 *
 * Opciones de `run`:
 *   --base <url>          API (default http://localhost:$PORT|3000)
 *   --eleccion <id>       idEleccion (requerido)
 *   --voters <n>          cantidad de votantes (default 1000)
 *   --duration-min <min>  ventana de llegada; 0 = todos a la vez (default 0)
 *   --max-inflight <n>    tope de votantes concurrentes (default 200)
 *   --prefix <str>        prefijo de nick/dni (default "stress")
 *   --chain-id <n>        chainId del dominio EIP-712 (default 11155111)
 *   --rpc <url>           si se indica, verifica los receipts on-chain
 *   --report <file>       escribe el reporte JSON
 *   --seed <n>            semilla del reparto de llegadas (reproducible)
 *
 * Código de salida: 0 si todos los votos se registraron; 1 en caso contrario.
 */
import { createServer } from 'node:http';
import { writeFileSync } from 'node:fs';
import { config } from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  Wallet,
  JsonRpcProvider,
  keccak256,
  toUtf8Bytes,
  randomBytes,
} from 'ethers';

const backRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
config({ path: resolve(backRoot, '.env') });

const DNI_BASE = 90_000_000;

const parseArgs = (argv) => {
  const [command = 'run', ...rest] = argv;
  const options = {};
  for (let i = 0; i < rest.length; i++) {
    if (!rest[i].startsWith('--')) continue;
    options[rest[i].slice(2)] = rest[i + 1]?.startsWith('--')
      ? 'true'
      : rest[++i];
  }
  return { command, options };
};

const { command, options } = parseArgs(process.argv.slice(2));
const num = (key, fallback) =>
  options[key] === undefined ? fallback : Number(options[key]);
const PREFIX = options.prefix ?? 'stress';
const VOTERS = num('voters', 1000);

const nickOf = (i) => `${PREFIX}${String(i).padStart(5, '0')}`;
const dniOf = (i) => String(DNI_BASE + i);
const emailOf = (i) => `${nickOf(i)}@stress.votar.test`;

const fail = (message) => {
  console.error(`[stress] ERROR: ${message}`);
  process.exit(1);
};

/* ----------------------------------- csv ---------------------------------- */

const runCsv = () => {
  const out = options.out ?? 'padron-stress.csv';
  const lines = ['dni,email'];
  for (let i = 0; i < VOTERS; i++) lines.push(`${dniOf(i)},${emailOf(i)}`);
  writeFileSync(out, `${lines.join('\n')}\n`);
  console.log(`[stress] ${VOTERS} votantes sintéticos → ${out}`);
};

/* ---------------------------------- mock ---------------------------------- */

const runMock = () => {
  const port = num('port', 4010);
  const nickToIndex = (nick) => {
    if (typeof nick !== 'string' || !nick.startsWith(PREFIX)) return null;
    const digits = nick.slice(PREFIX.length);
    return /^\d{5}$/.test(digits) ? Number(digits) : null;
  };
  createServer((req, res) => {
    const nick = req.headers.nick;
    const index = nickToIndex(Array.isArray(nick) ? nick[0] : nick);
    const json = (status, body) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    if (index === null) return json(401, { error: 'unknown user' });
    if (req.method === 'POST' && req.url?.endsWith('/login')) {
      return json(200, { hashActual: `hash-${index}` });
    }
    if (req.method === 'GET' && req.url?.endsWith('/usuarios')) {
      return json(200, {
        persona: {
          dni: dniOf(index),
          email: emailOf(index),
          legajo: index,
          nombre: 'Votante',
          apellido: `Sintético ${index}`,
        },
      });
    }
    return json(404, { error: 'not found' });
  }).listen(port, () => {
    console.log(`[stress] Autogestión falsa en http://localhost:${port}`);
    console.log(
      `[stress] Backend: AUTOGESTION_BASE_URL=http://localhost:${port}`,
    );
  });
};

/* ----------------------------------- run ---------------------------------- */

const BASE = (
  options.base ?? `http://localhost:${process.env.PORT ?? 3000}`
).replace(/\/$/, '');

const VOTE_TYPES = {
  Vote: [
    { name: 'electionId', type: 'uint256' },
    { name: 'nullifier', type: 'bytes32' },
    { name: 'selectionHash', type: 'bytes32' },
    { name: 'candidateIds', type: 'uint256[]' },
    { name: 'timestamp', type: 'uint256' },
  ],
};

const cookieHeader = (response) =>
  (response.headers.getSetCookie?.() ?? [])
    .map((c) => c.split(';')[0])
    .join('; ');

const http = async (path, { method = 'GET', body, cookies } = {}) => {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (cookies) headers.Cookie = cookies;
  const started = performance.now();
  try {
    const response = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    return {
      status: response.status,
      data,
      response,
      ms: performance.now() - started,
    };
  } catch (error) {
    return {
      status: 0,
      data: String(error),
      response: null,
      ms: performance.now() - started,
    };
  }
};

/** PRNG determinístico (mulberry32) para repartir las llegadas de forma reproducible. */
const rng = (seed) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const percentile = (sorted, p) =>
  sorted.length === 0
    ? 0
    : sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];

const pickSelection = (boleta, random) => {
  const selecciones = [];
  for (const categoria of boleta.categorias) {
    const candidatos = categoria.candidatos ?? [];
    if (candidatos.length === 0) continue;
    const elegido = candidatos[Math.floor(random() * candidatos.length)];
    selecciones.push({
      idCategoria: categoria.idCategoria,
      idCandidato: elegido.idCandidato,
    });
  }
  if (selecciones.length === 0)
    throw new Error('la boleta no tiene candidatos');
  selecciones.sort(
    (a, b) => a.idCategoria - b.idCategoria || a.idCandidato - b.idCandidato,
  );
  return selecciones;
};

const voteOne = async (index, ctx, stepStats) => {
  const timings = {};
  const step = async (
    name,
    request,
    acceptable = (r) => r.status >= 200 && r.status < 300,
  ) => {
    const result = await request();
    (stepStats[name] ??= []).push(result.ms);
    timings[name] = result.ms;
    if (!acceptable(result)) {
      const error = new Error(
        `${name} → HTTP ${result.status} ${JSON.stringify(result.data)?.slice(0, 200)}`,
      );
      error.step = name;
      error.status = result.status;
      throw error;
    }
    return result;
  };
  const started = performance.now();
  const idEleccion = ctx.idEleccion;

  const login = await step('login', () =>
    http('/auth/votante/login', {
      method: 'POST',
      body: { nick: nickOf(index), password: 'stress', idEleccion },
    }),
  );
  const cookies = cookieHeader(login.response);
  if (!cookies)
    throw Object.assign(new Error('login sin cookie'), { step: 'login' });

  const boleta = (
    await step('boleta', () =>
      http(`/elecciones/${idEleccion}/boleta-digital`, { cookies }),
    )
  ).data;
  const proof = (
    await step('merkle-proof', () =>
      http(`/elecciones/${idEleccion}/merkle-proof`, { cookies }),
    )
  ).data;
  const verifyingContract =
    proof.ballotContractAddress ?? boleta.ballotContractAddress;

  // Billetera efímera + credencial anónima (todo el material criptográfico vive solo en este proceso).
  const wallet = Wallet.createRandom();
  const secreto = keccak256(randomBytes(32));
  const commit = keccak256(secreto);
  const nullifier = keccak256(
    toUtf8Bytes(`${wallet.signingKey.compressedPublicKey}:${idEleccion}`),
  );

  await step('credencial', () =>
    http(`/elecciones/${idEleccion}/validacion/credencial`, {
      method: 'POST',
      body: { commit },
      cookies,
    }),
  );
  const auth = (
    await step('autorizacion', () =>
      http(`/elecciones/${idEleccion}/relayer/autorizacion`, {
        method: 'POST',
        cookies,
      }),
    )
  ).data;

  const selecciones = pickSelection(boleta, ctx.random);
  const selectionHash = keccak256(
    toUtf8Bytes(
      JSON.stringify({ votoEnBlanco: false, votoNulo: false, selecciones }),
    ),
  );
  const candidateIds = selecciones.map((s) => BigInt(s.idCandidato));
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = await wallet.signTypedData(
    { name: 'VOTAR', version: '2', chainId: ctx.chainId, verifyingContract },
    VOTE_TYPES,
    {
      electionId: BigInt(idEleccion),
      nullifier,
      selectionHash,
      candidateIds,
      timestamp: BigInt(timestamp),
    },
  );

  // Fases anónimas: sin cookie, como el cliente real.
  const firma = (
    await step('firma-validacion', () =>
      http(`/elecciones/${idEleccion}/validacion/firma`, {
        method: 'POST',
        body: {
          secreto,
          nullifier,
          selectionHash,
          candidateIds: candidateIds.map(String),
          timestamp,
          expectedSigner: wallet.address,
        },
      }),
    )
  ).data;

  const cast = (
    await step('relayer-cast', () =>
      http(`/elecciones/${idEleccion}/relayer/cast`, {
        method: 'POST',
        body: {
          voterLeaf: proof.hashHoja,
          nullifier,
          selectionHash,
          candidateIds: candidateIds.map(String),
          timestamp: String(timestamp),
          expectedSigner: wallet.address,
          signature,
          validatorSignature: firma.firmaValidacion,
          relayToken: auth.relayToken,
        },
      }),
    )
  ).data;

  return {
    index,
    txHash: cast.txHash,
    nullifier,
    totalMs: performance.now() - started,
    timings,
  };
};

const runLoad = async () => {
  const idEleccion = num('eleccion');
  if (!Number.isInteger(idEleccion) || idEleccion <= 0)
    fail('--eleccion <id> es requerido');
  const durationMs = num('duration-min', 0) * 60_000;
  const maxInflight = num('max-inflight', 200);
  const seed = num('seed', 520);
  const random = rng(seed);
  const ctx = { idEleccion, chainId: num('chain-id', 11155111), random };

  console.log(
    `[stress] ${VOTERS} votantes → ${BASE} comicio=${idEleccion} ventana=${
      durationMs ? `${durationMs / 60_000} min` : 'ráfaga'
    } max-inflight=${maxInflight}`,
  );

  // Instante de llegada de cada votante dentro de la ventana (uniforme, reproducible).
  const arrivals = Array.from({ length: VOTERS }, (_, i) => ({
    index: i,
    at: random() * durationMs,
  })).sort((a, b) => a.at - b.at);

  const stepStats = {};
  const successes = [];
  const failures = [];
  let inflight = 0;
  let peakInflight = 0;
  const waiters = [];
  const acquire = async () => {
    if (inflight >= maxInflight) await new Promise((r) => waiters.push(r));
    inflight++;
    peakInflight = Math.max(peakInflight, inflight);
  };
  const release = () => {
    inflight--;
    waiters.shift()?.();
  };

  const t0 = performance.now();
  const progress = setInterval(() => {
    const done = successes.length + failures.length;
    console.log(
      `[stress] ${done}/${VOTERS} (ok=${successes.length} fail=${failures.length} inflight=${inflight})`,
    );
  }, 5000);

  await Promise.all(
    arrivals.map(async ({ index, at }) => {
      const wait = at - (performance.now() - t0);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      await acquire();
      try {
        successes.push(await voteOne(index, ctx, stepStats));
      } catch (error) {
        failures.push({
          index,
          step: error.step ?? 'unknown',
          status: error.status ?? 0,
          message: error.message,
        });
      } finally {
        release();
      }
    }),
  );
  clearInterval(progress);
  const elapsedS = (performance.now() - t0) / 1000;

  // Integridad: txHash y nullifier únicos entre los votos aceptados.
  const txHashes = new Set(successes.map((s) => s.txHash));
  const nullifiers = new Set(successes.map((s) => s.nullifier));
  const duplicated =
    successes.length - Math.min(txHashes.size, nullifiers.size);

  // Verificación on-chain opcional: cada txHash debe tener receipt con status=1.
  let onChain = null;
  if (options.rpc) {
    const provider = new JsonRpcProvider(options.rpc);
    const hashes = [...txHashes];
    let confirmed = 0;
    const reverted = [];
    const missing = [];
    const timeoutMs = num('receipt-timeout-s', 120) * 1000;
    let cursor = 0;
    const worker = async () => {
      while (cursor < hashes.length) {
        const hash = hashes[cursor++];
        const receipt = await provider
          .waitForTransaction(hash, 1, timeoutMs)
          .catch(() => null);
        if (!receipt) missing.push(hash);
        else if (receipt.status === 1) confirmed++;
        else reverted.push(hash);
      }
    };
    console.log(
      `[stress] Verificando ${hashes.length} receipts en ${options.rpc} …`,
    );
    await Promise.all(Array.from({ length: 8 }, worker));
    onChain = {
      checked: hashes.length,
      confirmed,
      reverted: reverted.length,
      missing: missing.length,
    };
  }

  const summarize = (values) => {
    const sorted = [...values].sort((a, b) => a - b);
    return {
      n: sorted.length,
      p50: +percentile(sorted, 0.5).toFixed(1),
      p95: +percentile(sorted, 0.95).toFixed(1),
      p99: +percentile(sorted, 0.99).toFixed(1),
      max: +(sorted[sorted.length - 1] ?? 0).toFixed(1),
    };
  };
  const failuresByStep = failures.reduce((acc, f) => {
    const key = `${f.step}:${f.status}`;
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  const report = {
    eleccion: idEleccion,
    votantes: VOTERS,
    ventanaMin: durationMs / 60_000,
    duracionRealS: +elapsedS.toFixed(1),
    throughputVotosPorS: +(successes.length / elapsedS).toFixed(2),
    maxInflightObservado: peakInflight,
    aceptados: successes.length,
    fallidos: failures.length,
    duplicados: duplicated,
    fallosPorPasoYStatus: failuresByStep,
    latenciaVotoCompletoMs: summarize(successes.map((s) => s.totalMs)),
    latenciaPorPasoMs: Object.fromEntries(
      Object.entries(stepStats).map(([k, v]) => [k, summarize(v)]),
    ),
    onChain,
    muestraFallos: failures.slice(0, 10),
  };

  console.log('\n[stress] ===== REPORTE =====');
  console.log(JSON.stringify(report, null, 2));
  if (options.report) {
    writeFileSync(options.report, JSON.stringify(report, null, 2));
    console.log(`[stress] reporte → ${options.report}`);
  }

  const ok =
    failures.length === 0 &&
    duplicated === 0 &&
    (onChain === null ||
      (onChain.confirmed === onChain.checked && onChain.checked === VOTERS));
  console.log(
    ok
      ? `\n[stress] OK: ${VOTERS}/${VOTERS} votos registrados sin duplicados${onChain ? ' y confirmados on-chain' : ''}.`
      : '\n[stress] FAIL: hubo votos fallidos, duplicados o sin confirmar (ver reporte).',
  );
  process.exit(ok ? 0 : 1);
};

const commands = { csv: runCsv, mock: runMock, run: runLoad };
if (!commands[command])
  fail(`subcomando desconocido "${command}" (csv | mock | run)`);
Promise.resolve(commands[command]()).catch((error) =>
  fail(error instanceof Error ? error.stack : String(error)),
);
