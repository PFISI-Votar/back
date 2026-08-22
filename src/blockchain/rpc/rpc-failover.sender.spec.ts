import { RpcHttpError, sendJsonRpcWithFailover } from './rpc-failover.sender';

/* eslint-disable @typescript-eslint/require-await, @typescript-eslint/no-unsafe-member-access -- injected send/read mocks are sync */

describe('sendJsonRpcWithFailover — VOTAR-386', () => {
  const urls = [
    'https://sepolia.infura.io/v3/primarykey',
    'https://eth-sepolia.g.alchemy.com/v2/backupkey',
  ];

  it('UAT-01: rotates after an auth failure on the primary', async () => {
    const send = jest
      .fn()
      .mockRejectedValueOnce(new RpcHttpError(401, 'Unauthorized'))
      .mockResolvedValueOnce({ status: 200, json: { result: '0x1' } });
    const logger = { warn: jest.fn() };

    const json = await sendJsonRpcWithFailover(
      urls,
      { method: 'eth_blockNumber' },
      {
        send,
        logger,
        now: () => '2026-08-18T12:00:00.000Z',
      },
    );

    expect(json).toEqual({ result: '0x1' });
    expect(send).toHaveBeenCalledTimes(2);
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn.mock.calls[0][0]).toContain('reason=auth');
    expect(logger.warn.mock.calls[0][0]).toContain(
      'failed=https://sepolia.infura.io/v3/prim...',
    );
    expect(logger.warn.mock.calls[0][0]).toContain(
      'backup=https://eth-sepolia.g.alchemy.com/v2/back...',
    );
    expect(logger.warn.mock.calls[0][0]).toContain(
      'at=2026-08-18T12:00:00.000Z',
    );
  });

  it('UAT-02: rotates after a timeout without waiting the full stall', async () => {
    const send = jest
      .fn()
      .mockRejectedValueOnce(new RpcHttpError(408, 'RPC timeout after 800ms'))
      .mockResolvedValueOnce({ status: 200, json: { result: '0xa' } });

    const json = await sendJsonRpcWithFailover(
      urls,
      { method: 'eth_chainId' },
      {
        send,
        logger: { warn: jest.fn() },
      },
    );

    expect(json).toEqual({ result: '0xa' });
    expect(send).toHaveBeenNthCalledWith(
      1,
      urls[0],
      { method: 'eth_chainId' },
      800,
    );
  });

  it('UAT-03: rotates immediately on HTTP 429 and JSON-RPC quota errors', async () => {
    const send = jest
      .fn()
      .mockResolvedValueOnce({
        status: 429,
        json: { error: { message: 'Too Many Requests' } },
      })
      .mockResolvedValueOnce({
        status: 200,
        json: { error: { code: -32005, message: 'project rate limit' } },
      })
      .mockResolvedValueOnce({ status: 200, json: { result: '0x2' } });

    const threeUrls = [...urls, 'https://x.quiknode.pro/third'];
    const json = await sendJsonRpcWithFailover(
      threeUrls,
      { method: 'eth_blockNumber' },
      {
        send,
        logger: { warn: jest.fn() },
      },
    );

    expect(json).toEqual({ result: '0x2' });
    expect(send).toHaveBeenCalledTimes(3);
  });

  it('skips a lagging backup when block skew exceeds the threshold', async () => {
    const threeUrls = [...urls, 'https://x.quiknode.pro/thirdkey'];
    const send = jest
      .fn()
      .mockRejectedValueOnce(new RpcHttpError(429, 'Too Many Requests'))
      .mockResolvedValueOnce({ status: 200, json: { result: '0x1' } });
    const logger = { warn: jest.fn() };

    const json = await sendJsonRpcWithFailover(
      threeUrls,
      { method: 'eth_chainId' },
      {
        send,
        logger,
        lastKnownBlock: 100,
        maxBlockSkew: 5,
        readBlockNumber: async (url) => (url.includes('alchemy') ? 80 : 100),
      },
    );

    expect(json).toEqual({ result: '0x1' });
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1][0]).toBe(threeUrls[2]);
    expect(
      logger.warn.mock.calls.some((args) => String(args[0]).includes('skew=')),
    ).toBe(true);
  });

  it('does not rotate on contract-level JSON-RPC errors', async () => {
    const send = jest.fn().mockResolvedValue({
      status: 200,
      json: { error: { code: 3, message: 'execution reverted' } },
    });

    const json = await sendJsonRpcWithFailover(
      urls,
      { method: 'eth_call' },
      { send },
    );
    expect(json).toEqual({ error: { code: 3, message: 'execution reverted' } });
    expect(send).toHaveBeenCalledTimes(1);
  });
});
