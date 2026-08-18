import { FailoverJsonRpcProvider } from './failover-json-rpc.provider';

/* eslint-disable @typescript-eslint/require-await, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment -- fetch mocks return Response-like objects */

describe('FailoverJsonRpcProvider — VOTAR-386', () => {
  const jsonRpc = (result: unknown, id = 1) => ({
    jsonrpc: '2.0',
    id,
    result,
  });

  it('UAT-03 + UAT-04: failovers on 429 and logs the sanitized backup URL', async () => {
    const logger = { warn: jest.fn() };
    const fetchImpl = jest.fn(async (input: string) => {
      if (input.includes('infura')) {
        return {
          status: 429,
          json: async () => ({ error: { message: 'Too Many Requests' } }),
        } as Response;
      }
      return {
        status: 200,
        json: async () => jsonRpc('0x2a'),
      } as Response;
    });

    const provider = new FailoverJsonRpcProvider(
      [
        'https://sepolia.infura.io/v3/primarysecret',
        'https://eth-sepolia.g.alchemy.com/v2/backupsecret',
      ],
      { chainId: 11155111, logger, fetchImpl },
    );

    const blockNumber = await provider.send('eth_blockNumber', []);
    expect(blockNumber).toBe('0x2a');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn.mock.calls[0][0]).toContain('reason=rate_limit');
    expect(logger.warn.mock.calls[0][0]).not.toContain('primarysecret');
    expect(logger.warn.mock.calls[0][0]).not.toContain('backupsecret');
  });

  it('UAT-02: aborts a slow primary under the 1s budget and uses the backup', async () => {
    const logger = { warn: jest.fn() };
    const fetchImpl = jest.fn(async (input: string, init: RequestInit) => {
      if (input.includes('slow')) {
        await new Promise((_, reject) => {
          init.signal?.addEventListener('abort', () => {
            const error = new Error('The operation was aborted');
            error.name = 'AbortError';
            reject(error);
          });
        });
      }
      return {
        status: 200,
        json: async () => jsonRpc('0x1'),
      } as Response;
    });

    const provider = new FailoverJsonRpcProvider(
      ['https://slow.example/rpc', 'https://fast.example/rpc'],
      { chainId: 11155111, timeoutMs: 50, logger, fetchImpl },
    );

    const started = Date.now();
    await expect(provider.send('eth_chainId', [])).resolves.toBe('0x1');
    expect(Date.now() - started).toBeLessThan(1000);
    expect(logger.warn.mock.calls[0][0]).toContain('reason=timeout');
  });
});
