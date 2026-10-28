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

  describe('finality (reorg)', () => {
    const head = async (cache: RpcResponseCache, n: number) =>
      cache.resolve(payload('eth_blockNumber'), async () => ({
        id: 1,
        result: `0x${n.toString(16)}`,
      }));

    it('un bloque reciente vence por TTL y refleja el cambio tras un reorg', async () => {
      let now = 1000;
      const cache = new RpcResponseCache({
        latestTtlMs: 2000,
        finalityDepth: 64,
        now: () => now,
      });
      await head(cache, 100);
      const req = payload('eth_getBlockByNumber', ['0x63', false]);
      const load = jest
        .fn()
        .mockResolvedValueOnce({ id: 1, result: { hash: '0xrama-vieja' } })
        .mockResolvedValueOnce({ id: 1, result: { hash: '0xrama-nueva' } });

      await cache.resolve(req, load);
      expect(await cache.resolve(req, load)).toEqual({
        id: 1,
        result: { hash: '0xrama-vieja' },
      });
      expect(load).toHaveBeenCalledTimes(1);

      now += 2001; // reorg: la rama descartada no debe persistir
      expect(await cache.resolve(req, load)).toEqual({
        id: 1,
        result: { hash: '0xrama-nueva' },
      });
    });

    it('sin head conocido no cachea indefinidamente', async () => {
      let now = 1000;
      const cache = new RpcResponseCache({ latestTtlMs: 2000, now: () => now });
      const req = payload('eth_getBlockByNumber', ['0x1', false]);
      const load = jest.fn(async () => ({ id: 1, result: { n: 1 } }));
      await cache.resolve(req, load);
      now += 2001;
      await cache.resolve(req, load);
      expect(load).toHaveBeenCalledTimes(2);
    });

    it('un bloque finalizado se cachea sin vencimiento', async () => {
      let now = 1000;
      const cache = new RpcResponseCache({
        latestTtlMs: 2000,
        finalityDepth: 64,
        now: () => now,
      });
      await head(cache, 1000);
      const req = payload('eth_getBlockByNumber', ['0x10', false]);
      const load = jest.fn(async () => ({ id: 1, result: { n: 16 } }));
      await cache.resolve(req, load);
      now += 10 * 60 * 1000;
      await cache.resolve(req, load);
      expect(load).toHaveBeenCalledTimes(1);
    });

    it('receipt y getLogs recientes también vencen; los finalizados no', async () => {
      let now = 1000;
      const cache = new RpcResponseCache({
        latestTtlMs: 2000,
        finalityDepth: 64,
        now: () => now,
      });
      await head(cache, 1000);
      const recentReceipt = payload('eth_getTransactionReceipt', ['0xa']);
      const oldReceipt = payload('eth_getTransactionReceipt', ['0xb']);
      const recentLogs = payload('eth_getLogs', [
        { fromBlock: '0x3e0', toBlock: '0x3e7' },
      ]);
      const loadRecent = jest.fn(async () => ({
        id: 1,
        result: { blockNumber: '0x3e7' },
      }));
      const loadOld = jest.fn(async () => ({
        id: 1,
        result: { blockNumber: '0x10' },
      }));
      const loadLogs = jest.fn(async () => ({ id: 1, result: [{ a: 1 }] }));

      await cache.resolve(recentReceipt, loadRecent);
      await cache.resolve(oldReceipt, loadOld);
      await cache.resolve(recentLogs, loadLogs);
      now += 2001;
      await cache.resolve(recentReceipt, loadRecent);
      await cache.resolve(oldReceipt, loadOld);
      await cache.resolve(recentLogs, loadLogs);

      expect(loadRecent).toHaveBeenCalledTimes(2);
      expect(loadLogs).toHaveBeenCalledTimes(2);
      expect(loadOld).toHaveBeenCalledTimes(1);
    });
  });
});
