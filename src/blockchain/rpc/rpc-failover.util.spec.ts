import {
  assertRpcUrlsUseHttpsExceptLoopback,
  describeRpcEndpoint,
  isBlockSkewAcceptable,
  isRpcFailoverError,
  parseRpcUrls,
  sanitizeRpcUrl,
  classifyRpcFailoverReason,
} from './rpc-failover.util';

describe('rpc-failover.util — VOTAR-386', () => {
  it('parses primary + comma-separated fallbacks without duplicates', () => {
    expect(
      parseRpcUrls(
        'https://sepolia.infura.io/v3/aaa',
        'https://eth-sepolia.g.alchemy.com/v2/bbb, https://sepolia.infura.io/v3/aaa ,https://x.quiknode.pro/ccc',
      ),
    ).toEqual([
      'https://sepolia.infura.io/v3/aaa',
      'https://eth-sepolia.g.alchemy.com/v2/bbb',
      'https://x.quiknode.pro/ccc',
    ]);
  });

  it('sanitizes API keys in logs and labels well-known providers', () => {
    expect(sanitizeRpcUrl('https://sepolia.infura.io/v3/abcd1234secret')).toBe(
      'https://sepolia.infura.io/v3/abcd...',
    );
    expect(
      describeRpcEndpoint('https://eth-sepolia.g.alchemy.com/v2/key'),
    ).toContain('alchemy');
    expect(describeRpcEndpoint('https://foo.quiknode.pro/key')).toContain(
      'quicknode',
    );
  });

  it('UAT-03: treats HTTP 429 / Infura -32005 as failover errors', () => {
    expect(
      classifyRpcFailoverReason({ status: 429, message: 'Too Many Requests' }),
    ).toBe('rate_limit');
    expect(isRpcFailoverError(new Error('429 Too Many Requests'))).toBe(true);
    expect(isRpcFailoverError(new Error('limit exceeded code -32005'))).toBe(
      true,
    );
  });

  it('UAT-01: treats revoked API keys as failover errors', () => {
    expect(
      classifyRpcFailoverReason({ status: 401, message: 'Unauthorized' }),
    ).toBe('auth');
    expect(isRpcFailoverError(new Error('403 Forbidden invalid api key'))).toBe(
      true,
    );
  });

  it('UAT-02: treats timeouts as failover errors and ignores contract reverts', () => {
    expect(isRpcFailoverError(new Error('The operation was aborted'))).toBe(
      true,
    );
    expect(isRpcFailoverError(new Error('timeout exceeded'))).toBe(true);
    expect(isRpcFailoverError(new Error('execution reverted'))).toBe(false);
    expect(isRpcFailoverError(new Error('insufficient funds'))).toBe(false);
  });

  it('VOTAR-378 UAT-02: exige HTTPS salvo loopback', () => {
    expect(() =>
      assertRpcUrlsUseHttpsExceptLoopback([
        'https://sepolia.infura.io/v3/aaa',
        'http://127.0.0.1:8545',
      ]),
    ).not.toThrow();
    expect(() =>
      assertRpcUrlsUseHttpsExceptLoopback(['http://sepolia.infura.io/v3/aaa']),
    ).toThrow(/HTTPS/);
  });

  it('rejects backups with a significant block skew', () => {
    expect(isBlockSkewAcceptable(100, 102, 5)).toBe(true);
    expect(isBlockSkewAcceptable(100, 95, 5)).toBe(true);
    expect(isBlockSkewAcceptable(100, 90, 5)).toBe(false);
  });
});
