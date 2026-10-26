/* eslint-disable @typescript-eslint/require-await -- loaders/senders are async mocks */
import {
  RpcHttpError,
  computeRetryDelayMs,
  sendJsonRpcWithFailover,
} from './rpc-failover.sender';

describe('sendJsonRpcWithFailover retries — VOTAR-515', () => {
  const urls = ['https://a.example/k1', 'https://b.example/k2'];
  const retry = {
    maxRetries: 3,
    baseDelayMs: 100,
    random: () => 1,
  };

  it('reintenta con backoff exponencial tras agotar primario y respaldo', async () => {
    const sleep = jest.fn<Promise<void>, [number]>(async () => undefined);
    const send = jest
      .fn()
      .mockResolvedValueOnce({ status: 503, json: null })
      .mockResolvedValueOnce({ status: 503, json: null })
      .mockResolvedValueOnce({ status: 503, json: null })
      .mockResolvedValueOnce({ status: 503, json: null })
      .mockResolvedValueOnce({ status: 200, json: { result: '0x1' } });

    const json = await sendJsonRpcWithFailover(
      urls,
      {},
      {
        retry: { ...retry, sleep },
        send,
      },
    );

    expect(json).toEqual({ result: '0x1' });
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([100, 200]);
  });

  it('no reintenta errores de autenticación', async () => {
    const sleep = jest.fn<Promise<void>, [number]>(async () => undefined);
    const send = jest.fn().mockResolvedValue({ status: 401, json: null });

    await expect(
      sendJsonRpcWithFailover(
        ['https://a.example/k'],
        {},
        {
          retry: { ...retry, sleep },
          send,
        },
      ),
    ).rejects.toBeInstanceOf(RpcHttpError);
    expect(sleep).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('se rinde tras maxRetries y propaga el último error', async () => {
    const sleep = jest.fn<Promise<void>, [number]>(async () => undefined);
    const send = jest.fn().mockResolvedValue({ status: 429, json: null });

    await expect(
      sendJsonRpcWithFailover(
        ['https://a.example/k'],
        {},
        {
          retry: { ...retry, maxRetries: 2, sleep },
          send,
        },
      ),
    ).rejects.toThrow(/Too Many Requests/);
    expect(send).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it('acota el backoff a maxDelayMs', () => {
    expect(
      computeRetryDelayMs(10, {
        maxRetries: 1,
        baseDelayMs: 250,
        maxDelayMs: 1000,
        random: () => 1,
      }),
    ).toBe(1000);
  });
});
