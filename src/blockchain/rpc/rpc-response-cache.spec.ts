/* eslint-disable @typescript-eslint/require-await -- loaders/senders are async mocks */
import { RpcResponseCache, rpcCacheTtlMs } from './rpc-response-cache';

describe('RpcResponseCache — VOTAR-515', () => {
  const payload = (method: string, params: unknown[] = [], id = 1) => ({
    id,
    method,
    params,
    jsonrpc: '2.0' as const,
  });

  it('sirve eth_blockNumber desde caché hasta vencer el TTL y reescribe el id', async () => {
    let now = 1000;
    const cache = new RpcResponseCache({ latestTtlMs: 2000, now: () => now });
    const load = jest.fn(async () => ({ id: 1, result: '0x10' }));

    await cache.resolve(payload('eth_blockNumber'), load);
    const hit = await cache.resolve(payload('eth_blockNumber', [], 7), load);
    expect(hit).toEqual({ id: 7, result: '0x10' });
    expect(load).toHaveBeenCalledTimes(1);

    now += 2001;
    await cache.resolve(payload('eth_blockNumber'), load);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('coalesce requests idénticas en vuelo', async () => {
    const cache = new RpcResponseCache();
    const load = jest.fn(async () => ({ id: 1, result: '0xaa' }));
    const req = payload('eth_getBlockByNumber', ['0x5', false]);

    await Promise.all([cache.resolve(req, load), cache.resolve(req, load)]);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('no cachea resultados nulos ni errores', async () => {
    const cache = new RpcResponseCache();
    const nullLoad = jest.fn(async () => ({ id: 1, result: null }));
    const req = payload('eth_getTransactionReceipt', ['0xabc']);
    await cache.resolve(req, nullLoad);
    await cache.resolve(req, nullLoad);
    expect(nullLoad).toHaveBeenCalledTimes(2);
    expect(cache.size).toBe(0);
  });

  it('no cachea escrituras ni eth_call sobre "latest"', () => {
    expect(rpcCacheTtlMs(payload('eth_sendRawTransaction', ['0x']), 2000)).toBe(
      null,
    );
    expect(
      rpcCacheTtlMs(payload('eth_call', [{ to: '0x1' }, 'latest']), 2000),
    ).toBe(null);
    expect(
      rpcCacheTtlMs(payload('eth_call', [{ to: '0x1' }, '0x10']), 2000),
    ).toBe(Number.POSITIVE_INFINITY);
  });

  it('descarta la entrada más vieja al superar maxEntries', async () => {
    const cache = new RpcResponseCache({ maxEntries: 2 });
    for (const n of ['0x1', '0x2', '0x3']) {
      await cache.resolve(
        payload('eth_getBlockByNumber', [n, false]),
        async () => ({
          id: 1,
          result: { n },
        }),
      );
    }
    expect(cache.size).toBe(2);
  });
});
