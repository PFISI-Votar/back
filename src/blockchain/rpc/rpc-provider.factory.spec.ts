import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FetchRequest, JsonRpcProvider } from 'ethers';
import { FailoverJsonRpcProvider } from './failover-json-rpc.provider';
import { RpcProviderFactory } from './rpc-provider.factory';

jest.mock('ethers', () => {
  const actual = jest.requireActual<typeof import('ethers')>('ethers');
  return {
    ...actual,
    JsonRpcProvider: jest.fn().mockImplementation((url: string) => ({ url })),
  };
});

describe('RpcProviderFactory — VOTAR-386', () => {
  const createFactory = (
    values: Record<string, string | number | undefined>,
  ) => {
    const config = {
      get: jest.fn((key: string) => values[key]),
    };
    return new RpcProviderFactory(config as unknown as ConfigService);
  };

  it('uses JsonRpcProvider when a single URL is configured', () => {
    const factory = createFactory({
      SEPOLIA_RPC_URL: 'https://sepolia.example/rpc',
      CHAIN_ID: 11155111,
    });

    const provider = factory.create();
    expect(JsonRpcProvider).toHaveBeenCalledWith('https://sepolia.example/rpc');
    expect(provider).toEqual({ url: 'https://sepolia.example/rpc' });
  });

  it('attaches Cloudflare Access credentials to the private primary RPC', () => {
    const factory = createFactory({
      SEPOLIA_RPC_URL: 'https://rpc-admin11.probit.com.ar',
      CHAIN_ID: 31337,
      CF_ACCESS_CLIENT_ID: 'client-id',
      CF_ACCESS_CLIENT_SECRET: 'client-secret',
    });

    factory.create();
    const connection = (JsonRpcProvider as unknown as jest.Mock).mock.calls.at(
      -1,
    )?.[0] as FetchRequest;
    expect(connection).toBeInstanceOf(FetchRequest);
    expect(connection.getHeader('CF-Access-Client-Id')).toBe('client-id');
    expect(connection.getHeader('CF-Access-Client-Secret')).toBe(
      'client-secret',
    );
  });

  it('rejects an incomplete Cloudflare Access credential pair', () => {
    const factory = createFactory({
      SEPOLIA_RPC_URL: 'https://rpc-admin11.probit.com.ar',
      CF_ACCESS_CLIENT_ID: 'client-id',
    });
    expect(() => factory.create()).toThrow(/CF_ACCESS_CLIENT_SECRET/);
  });

  it('builds a failover provider when backup URLs are present', () => {
    const factory = createFactory({
      SEPOLIA_RPC_URL: 'https://sepolia.infura.io/v3/aaa',
      SEPOLIA_RPC_FALLBACK_URLS:
        'https://eth-sepolia.g.alchemy.com/v2/bbb,https://x.quiknode.pro/ccc',
      CHAIN_ID: 11155111,
    });

    expect(factory.getUrls()).toHaveLength(3);
    expect(factory.create()).toBeInstanceOf(FailoverJsonRpcProvider);
  });

  it('reuses the same provider instance across repeated create() calls', () => {
    const factory = createFactory({
      SEPOLIA_RPC_URL: 'https://sepolia.infura.io/v3/aaa',
      SEPOLIA_RPC_FALLBACK_URLS: 'https://eth-sepolia.g.alchemy.com/v2/bbb',
      CHAIN_ID: 11155111,
    });

    const first = factory.create();
    const second = factory.create();
    expect(first).toBe(second);
  });

  it('throws when no RPC URL is configured', () => {
    const factory = createFactory({});
    expect(() => factory.create()).toThrow(ServiceUnavailableException);
  });

  it('VOTAR-378 UAT-02: rechaza RPC HTTP públicos', () => {
    const factory = createFactory({
      SEPOLIA_RPC_URL: 'http://sepolia.infura.io/v3/aaa',
    });
    expect(() => factory.getUrls()).toThrow(/HTTPS/);
  });
});
