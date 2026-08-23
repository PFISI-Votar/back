import {
  ForbiddenException,
  HttpException,
  NotFoundException,
} from '@nestjs/common';
import { PoliticaRevoto } from '@/eleccion/configuracion-comicio/enums/politica-revoto.enum';
import { EleccionEstado } from '@/eleccion/enums/eleccion-estado.enum';
import { RegistroIntentoSufragio } from '@/voto/entities/registro-intento-sufragio.entity';
import { RevotePolicyService } from '@/voto/services/revote-policy.service';

const VOTANTE_HASH = 'b'.repeat(64);

type ConfigStub = {
  idEleccion: number;
  permitirVotoMultiple: boolean;
  maxVotosPorVotante: number;
  minIntervaloSegundos: number;
  politicaRevoto: PoliticaRevoto;
};

type RegistroStub = {
  votosConsumidos: number;
  ultimoIntentoAt: Date | null;
};

const baseConfig: ConfigStub = {
  idEleccion: 1,
  permitirVotoMultiple: true,
  maxVotosPorVotante: 3,
  minIntervaloSegundos: 0,
  politicaRevoto: PoliticaRevoto.LAST_VOTE_WINS,
};

const createService = (options?: {
  config?: Partial<ConfigStub> | null;
  registro?: RegistroStub | null;
  estado?: EleccionEstado | null;
}) => {
  const config =
    options?.config === null ? null : { ...baseConfig, ...options?.config };
  const registro = options && 'registro' in options ? options.registro : null;
  const estado =
    options && 'estado' in options ? options.estado : EleccionEstado.ABIERTA;

  const saved: Array<{
    idEleccion: number;
    claveIntento: string;
    votosConsumidos: number;
    ultimoIntentoAt: Date | null;
  }> = [];

  let store: {
    idEleccion: number;
    claveIntento: string;
    votosConsumidos: number;
    ultimoIntentoAt: Date | null;
  } | null = registro
    ? {
        idEleccion: 1,
        claveIntento: VOTANTE_HASH,
        votosConsumidos: registro.votosConsumidos,
        ultimoIntentoAt: registro.ultimoIntentoAt,
      }
    : null;

  const eleccionRepository = {
    findOne: jest
      .fn()
      .mockResolvedValue(estado === null ? null : { idEleccion: 1, estado }),
  };
  const configuracionRepository = {
    findOne: jest.fn().mockResolvedValue(config),
  };
  const intentoRepository = {
    findOne: jest.fn().mockImplementation(() =>
      Promise.resolve(
        store
          ? {
              ...store,
            }
          : null,
      ),
    ),
    create: jest.fn((data: (typeof saved)[number]) => ({ ...data })),
    save: jest.fn((entity: (typeof saved)[number]) => {
      store = { ...entity };
      saved.push(entity);
      return Promise.resolve(entity);
    }),
  };

  const transactionalRepo = {
    findOne: jest.fn().mockImplementation(() =>
      Promise.resolve(
        store
          ? {
              ...store,
            }
          : null,
      ),
    ),
    findOneOrFail: jest.fn().mockImplementation(() => {
      if (!store) {
        return Promise.reject(new Error('missing registro'));
      }
      return Promise.resolve({ ...store });
    }),
    create: jest.fn((data: Partial<RegistroIntentoSufragio>) => ({
      ...data,
    })),
    save: jest.fn((entity: (typeof saved)[number]) => {
      store = {
        idEleccion: entity.idEleccion,
        claveIntento: entity.claveIntento,
        votosConsumidos: entity.votosConsumidos,
        ultimoIntentoAt: entity.ultimoIntentoAt,
      };
      saved.push({ ...store });
      return Promise.resolve(store);
    }),
  };

  const dataSource = {
    transaction: jest.fn(async (cb: (manager: unknown) => Promise<unknown>) =>
      cb({
        getRepository: () => transactionalRepo,
      }),
    ),
  };

  const service = new RevotePolicyService(
    eleccionRepository as never,
    configuracionRepository as never,
    intentoRepository as never,
    dataSource as never,
  );

  return { service, saved, storeRef: () => store, transactionalRepo };
};

describe('RevotePolicyService (VOTAR-328)', () => {
  it('UAT-01: con maxVotesPerVoter=3 y 1 voto consumido expone intentosRestantes=2', async () => {
    const { service } = createService({
      registro: { votosConsumidos: 1, ultimoIntentoAt: new Date() },
    });

    const estado = await service.obtenerEstado(1, VOTANTE_HASH);

    expect(estado).toMatchObject({
      revoteHabilitado: true,
      maxVotosPorVotante: 3,
      votosConsumidos: 1,
      intentosRestantes: 2,
      puedeVotar: true,
      politicaRevoto: PoliticaRevoto.LAST_VOTE_WINS,
    });
  });

  it('UAT-02: al consumir el tercer voto deja intentosRestantes=0 y puedeVotar=false', async () => {
    const { service, saved } = createService({
      registro: { votosConsumidos: 2, ultimoIntentoAt: new Date() },
    });

    const estado = await service.registrarConsumo(1, VOTANTE_HASH);

    expect(saved[saved.length - 1].votosConsumidos).toBe(3);
    expect(estado).toMatchObject({
      votosConsumidos: 3,
      intentosRestantes: 0,
      puedeVotar: false,
      maxVotosPorVotante: 3,
    });
  });

  it('sin re-voto habilitado limita a un solo intento', async () => {
    const { service } = createService({
      config: {
        permitirVotoMultiple: false,
        maxVotosPorVotante: 5,
        politicaRevoto: PoliticaRevoto.DISABLED,
      },
      registro: { votosConsumidos: 1, ultimoIntentoAt: new Date() },
    });

    const estado = await service.obtenerEstado(1, VOTANTE_HASH);

    expect(estado.maxVotosPorVotante).toBe(1);
    expect(estado.intentosRestantes).toBe(0);
    expect(estado.puedeVotar).toBe(false);
    expect(estado.revoteHabilitado).toBe(false);
  });

  it('votante sin registros previos ve todos los intentos disponibles', async () => {
    const { service } = createService({ registro: null });

    const estado = await service.obtenerEstado(1, VOTANTE_HASH);

    expect(estado.votosConsumidos).toBe(0);
    expect(estado.intentosRestantes).toBe(3);
    expect(estado.puedeVotar).toBe(true);
  });

  it('VOTAR-323: con re-voto habilitado y maxVotos=1 en BD expone mínimo 2 sufragios', async () => {
    const { service } = createService({
      config: { maxVotosPorVotante: 1 },
      registro: null,
    });

    const estado = await service.obtenerEstado(1, VOTANTE_HASH);

    expect(estado.maxVotosPorVotante).toBe(2);
    expect(estado.intentosRestantes).toBe(2);
    expect(estado.puedeVotar).toBe(true);
  });

  it('VOTAR-323: tras el primer voto con re-voto (max=2) queda 1 intento para modificar', async () => {
    const { service } = createService({
      config: { maxVotosPorVotante: 2 },
      registro: { votosConsumidos: 1, ultimoIntentoAt: new Date() },
    });

    const estado = await service.obtenerEstado(1, VOTANTE_HASH);

    expect(estado.intentosRestantes).toBe(1);
    expect(estado.puedeVotar).toBe(true);
  });

  it('bloquea puedeVotar mientras corre el intervalo mínimo', async () => {
    const { service } = createService({
      config: { minIntervaloSegundos: 120 },
      registro: {
        votosConsumidos: 1,
        ultimoIntentoAt: new Date(Date.now() - 30_000),
      },
    });

    const estado = await service.obtenerEstado(1, VOTANTE_HASH);

    expect(estado.intentosRestantes).toBe(2);
    expect(estado.puedeVotar).toBe(false);
    expect(estado.proximoReintentoEnSegundos).toBeGreaterThan(0);
    expect(estado.proximoReintentoEnSegundos).toBeLessThanOrEqual(120);
  });

  it('VOTAR-325 UAT-01: registrarConsumo lanza 429 con proximoReintentoEnSegundos mientras corre el cooldown', async () => {
    const { service, saved } = createService({
      config: { minIntervaloSegundos: 120 },
      registro: {
        votosConsumidos: 1,
        ultimoIntentoAt: new Date(Date.now() - 30_000),
      },
    });

    try {
      await service.registrarConsumo(1, VOTANTE_HASH);
      throw new Error('expected registrarConsumo to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      const httpError = error as HttpException;
      expect(httpError.getStatus()).toBe(429);
      expect(
        httpError.getResponse() as { proximoReintentoEnSegundos: number },
      ).toMatchObject({
        proximoReintentoEnSegundos: expect.any(Number) as number,
      });
    }
    expect(saved).toHaveLength(0);
  });

  it('VOTAR-325: registrarConsumo incrementa normalmente cuando el cooldown ya venció', async () => {
    const { service, saved } = createService({
      config: { minIntervaloSegundos: 60 },
      registro: {
        votosConsumidos: 1,
        ultimoIntentoAt: new Date(Date.now() - 61_000),
      },
    });

    const estado = await service.registrarConsumo(1, VOTANTE_HASH);

    expect(saved[saved.length - 1].votosConsumidos).toBe(2);
    expect(estado.votosConsumidos).toBe(2);
  });

  it('VOTAR-449 / VOTAR-452: el cooldown de un legajo no bloquea a otro claveIntento distinto', async () => {
    const otroHash = 'c'.repeat(64);
    const stores = new Map<
      string,
      {
        idEleccion: number;
        claveIntento: string;
        votosConsumidos: number;
        ultimoIntentoAt: Date | null;
      }
    >();
    stores.set(VOTANTE_HASH, {
      idEleccion: 1,
      claveIntento: VOTANTE_HASH,
      votosConsumidos: 1,
      ultimoIntentoAt: new Date(),
    });
    const intentoRepository = {
      findOne: jest
        .fn()
        .mockImplementation(
          ({ where }: { where: { claveIntento: string } }) => {
            const row = stores.get(where.claveIntento);
            return Promise.resolve(row ? { ...row } : null);
          },
        ),
      create: jest.fn((data: unknown) => data),
      save: jest.fn((entity: unknown) => Promise.resolve(entity)),
    };
    const transactionalRepo = {
      findOne: jest
        .fn()
        .mockImplementation(
          ({ where }: { where: { claveIntento: string } }) => {
            const row = stores.get(where.claveIntento);
            return Promise.resolve(row ? { ...row } : null);
          },
        ),
      findOneOrFail: jest.fn(),
      create: jest.fn((data: Partial<RegistroIntentoSufragio>) => ({
        ...data,
      })),
      save: jest.fn(
        (entity: {
          idEleccion: number;
          claveIntento: string;
          votosConsumidos: number;
          ultimoIntentoAt: Date | null;
        }) => {
          stores.set(entity.claveIntento, { ...entity });
          return Promise.resolve(entity);
        },
      ),
    };
    const service = new RevotePolicyService(
      {
        findOne: jest
          .fn()
          .mockResolvedValue({ idEleccion: 1, estado: EleccionEstado.ABIERTA }),
      } as never,
      {
        findOne: jest.fn().mockResolvedValue({
          ...baseConfig,
          minIntervaloSegundos: 900,
        }),
      } as never,
      intentoRepository as never,
      {
        transaction: jest.fn(
          async (cb: (manager: unknown) => Promise<unknown>) =>
            cb({ getRepository: () => transactionalRepo }),
        ),
      } as never,
    );

    const bloqueado = await service.obtenerEstado(1, VOTANTE_HASH);
    const libre = await service.obtenerEstado(1, otroHash);

    expect(bloqueado.puedeVotar).toBe(false);
    expect(bloqueado.proximoReintentoEnSegundos).toBeGreaterThan(0);
    expect(libre.puedeVotar).toBe(true);
    expect(libre.proximoReintentoEnSegundos).toBeUndefined();
    expect(libre.votosConsumidos).toBe(0);
  });

  it('no incrementa consumos por encima del máximo', async () => {
    const { service, saved } = createService({
      registro: { votosConsumidos: 3, ultimoIntentoAt: new Date() },
    });

    const estado = await service.registrarConsumo(1, VOTANTE_HASH);

    expect(saved).toHaveLength(0);
    expect(estado.votosConsumidos).toBe(3);
    expect(estado.intentosRestantes).toBe(0);
  });

  it('VOTAR-452: sync con votosObjetivo es idempotente ante doble llamada', async () => {
    const { service, storeRef } = createService({
      registro: { votosConsumidos: 0, ultimoIntentoAt: null },
    });

    const first = await service.registrarConsumo(1, VOTANTE_HASH, 1);
    const second = await service.registrarConsumo(1, VOTANTE_HASH, 1);

    expect(first.votosConsumidos).toBe(1);
    expect(second.votosConsumidos).toBe(1);
    expect(storeRef()?.votosConsumidos).toBe(1);
  });

  it('VOTAR-452: votosObjetivo sincroniza hacia el conteo on-chain sin pasarse del max', async () => {
    const { service, storeRef } = createService({
      registro: {
        votosConsumidos: 1,
        ultimoIntentoAt: new Date(Date.now() - 120_000),
      },
      config: { minIntervaloSegundos: 0, maxVotosPorVotante: 3 },
    });

    const estado = await service.registrarConsumo(1, VOTANTE_HASH, 99);

    expect(estado.votosConsumidos).toBe(3);
    expect(storeRef()?.votosConsumidos).toBe(3);
  });

  it('VOTAR-452: segundo revoto tras cooldown expirado incrementa consumo', async () => {
    const { service, storeRef } = createService({
      config: { minIntervaloSegundos: 20, maxVotosPorVotante: 3 },
      registro: {
        votosConsumidos: 1,
        ultimoIntentoAt: new Date(Date.now() - 25_000),
      },
    });

    const estado = await service.registrarConsumo(1, VOTANTE_HASH, 2);

    expect(estado.votosConsumidos).toBe(2);
    expect(estado.intentosRestantes).toBe(1);
    expect(storeRef()?.votosConsumidos).toBe(2);
  });

  it('rechaza consumo si el comicio no está abierto', async () => {
    const { service } = createService({ estado: EleccionEstado.CERRADA });

    await expect(
      service.registrarConsumo(1, VOTANTE_HASH),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('falla si el comicio no existe', async () => {
    const { service } = createService({ estado: null });

    await expect(
      service.obtenerEstado(99, VOTANTE_HASH),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
