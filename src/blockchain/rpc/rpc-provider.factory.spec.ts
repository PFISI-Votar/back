import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JsonRpcProvider } from 'ethers';
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

  it('throws when no RPC URL is configured', () => {
    const factory = createFactory({});
    expect(() => factory.create()).toThrow(ServiceUnavailableException);
  });
});
