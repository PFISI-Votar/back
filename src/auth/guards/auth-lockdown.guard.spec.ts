import { ExecutionContext, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthLockdownScopeValue } from '@/auth/decorators/auth-lockdown-scope.decorator';
import { AuthLockdownGuard } from '@/auth/guards/auth-lockdown.guard';
import {
  AuthBloqueoAlcance,
  ConfiguracionSistema,
} from '@/configuracion-sistema/entities/configuracion-sistema.entity';

const buildContext = (body: Record<string, unknown> = {}): ExecutionContext =>
  ({
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => ({ body }) }),
  }) as unknown as ExecutionContext;

describe('AuthLockdownGuard', () => {
  let findOne: jest.Mock;
  let reflectorValue: jest.Mock;
  let allowlist: string;

  const build = async (): Promise<AuthLockdownGuard> => {
    findOne = jest.fn();
    reflectorValue = jest.fn();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthLockdownGuard,
        {
          provide: getRepositoryToken(ConfiguracionSistema),
          useValue: { findOne } as Partial<Repository<ConfiguracionSistema>>,
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) =>
              key === 'AUTH_LOCKDOWN_ALLOWLIST' ? allowlist : undefined,
            ),
          },
        },
        { provide: Reflector, useValue: { getAllAndOverride: reflectorValue } },
      ],
    }).compile();
    return module.get(AuthLockdownGuard);
  };

  const withState = (alcance: AuthBloqueoAlcance) =>
    findOne.mockResolvedValue({
      authBloqueoAlcance: alcance,
      authBloqueoMotivo: 'incidente',
      authBloqueoDesde: new Date(),
    });

  beforeEach(() => {
    allowlist = '';
  });

  const scope = (value: AuthLockdownScopeValue) =>
    reflectorValue.mockReturnValue(value);

  it('passes when the handler has no lockdown scope', async () => {
    const guard = await build();
    reflectorValue.mockReturnValue(undefined);
    await expect(guard.canActivate(buildContext())).resolves.toBe(true);
    expect(findOne).not.toHaveBeenCalled();
  });

  it('passes when alcance is NINGUNO', async () => {
    const guard = await build();
    scope('ADMIN');
    withState('NINGUNO');
    await expect(guard.canActivate(buildContext())).resolves.toBe(true);
  });

  it('blocks an ADMIN-scoped handler when alcance is ADMIN', async () => {
    const guard = await build();
    scope('ADMIN');
    withState('ADMIN');
    await expect(guard.canActivate(buildContext())).rejects.toThrow(
      ServiceUnavailableException,
    );
  });

  it('lets a voter (TODOS scope) through when alcance is only ADMIN', async () => {
    const guard = await build();
    scope('TODOS');
    withState('ADMIN');
    await expect(guard.canActivate(buildContext())).resolves.toBe(true);
  });

  it('blocks a voter (TODOS scope) when alcance is TODOS', async () => {
    const guard = await build();
    scope('TODOS');
    withState('TODOS');
    await expect(guard.canActivate(buildContext())).rejects.toThrow(
      ServiceUnavailableException,
    );
  });

  it('lets an allowlisted nick through despite the lockdown', async () => {
    allowlist = 'break.glass, otra';
    const guard = await build();
    scope('ADMIN');
    withState('ADMIN');
    await expect(
      guard.canActivate(buildContext({ nick: 'break.glass' })),
    ).resolves.toBe(true);
  });

  it('fails open when the config lookup throws', async () => {
    const guard = await build();
    scope('ADMIN');
    findOne.mockRejectedValue(new Error('db down'));
    await expect(guard.canActivate(buildContext())).resolves.toBe(true);
  });

  it('caches the state for 5s (single repo read across calls)', async () => {
    const guard = await build();
    scope('ADMIN');
    withState('NINGUNO');
    await guard.canActivate(buildContext());
    await guard.canActivate(buildContext());
    expect(findOne).toHaveBeenCalledTimes(1);
  });
});
