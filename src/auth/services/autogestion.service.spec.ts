import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { AutogestionService } from '@/auth/services/autogestion.service';

describe('AutogestionService', () => {
  let service: AutogestionService;

  const mockConfigService = {
    get: jest.fn((key: string) => {
      const config: Record<string, string> = {
        AUTOGESTION_BASE_URL: 'https://autogestion.test',
        AUTOGESTION_USER_AGENT: 'test-agent',
      };
      return config[key];
    }),
  };

  beforeEach(async () => {
    jest.restoreAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AutogestionService,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();
    service = module.get(AutogestionService);
  });

  it('returns hashActual on successful login', async () => {
    const mockFetch = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ hashActual: 'abc123hash' }),
    } as Response);

    const actualHash = await service.login('14988', 'secret');

    expect(actualHash).toBe('abc123hash');
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const callOptions = mockFetch.mock.calls[0]?.[1] as RequestInit;
    expect(callOptions.method).toBe('POST');
    expect(callOptions.headers).toMatchObject({
      nick: '14988',
      password: 'secret',
    });
  });

  it('throws UnauthorizedException on invalid credentials', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 401,
      text: () => Promise.resolve('Unauthorized'),
    } as Response);

    await expect(service.login('bad', 'wrong')).rejects.toThrow(
      UnauthorizedException,
    );
  });
});
