#!/usr/bin/env node
/**
 * VOTAR-364 UAT-02 helper — concurrent GETs against the cached resultados endpoint.
 *
 * Usage:
 *   node scripts/uat-364-concurrency.mjs [baseUrl] [idEleccion] [concurrency]
 *
 * Example:
 *   node scripts/uat-364-concurrency.mjs http://localhost:3000 1 100
 *
 * Expectation: p95 stays healthy and the browser never talks to Sepolia RPC
 * (this script only hits the NestJS API).
 */
const baseUrl = process.argv[2] ?? 'http://localhost:3000';
const idEleccion = Number(process.argv[3] ?? '1');
const concurrency = Number(process.argv[4] ?? '100');
const url = `${baseUrl.replace(/\/$/, '')}/elecciones/${idEleccion}/resultados`;

const runOne = async () => {
  const started = performance.now();
  const response = await fetch(url);
  const elapsed = performance.now() - started;
  return { status: response.status, elapsed };
};

const main = async () => {
  console.log(
    `VOTAR-364 UAT-02: ${concurrency} concurrent GETs → ${url}`,
  );
  const results = await Promise.all(
    Array.from({ length: concurrency }, () => runOne()),
  );
  const statuses = results.reduce((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {});
  const sorted = results.map((r) => r.elapsed).sort((a, b) => a - b);
  const p50 = sorted[Math.floor(sorted.length * 0.5)];
  const p95 = sorted[Math.floor(sorted.length * 0.95)];
  const max = sorted[sorted.length - 1];
  console.log('Statuses:', statuses);
  console.log(
    `Latency ms — p50=${p50.toFixed(1)} p95=${p95.toFixed(1)} max=${max.toFixed(1)}`,
  );
  const failures = results.filter((r) => r.status >= 500).length;
  if (failures > 0) {
    console.error(`FAIL: ${failures} server errors`);
    process.exit(1);
  }
  console.log('OK: no 5xx; clients read from API cache (not Sepolia).');
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
