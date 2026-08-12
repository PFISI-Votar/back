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
    const { service, saved } = createService({
      config: {
        permitirVotoMultiple: false,
        politicaRevoto: PoliticaRevoto.DISABLED,
      },
      registro: { votosConsumidos: 0, ultimoIntentoAt: null },
    });

    const estado = await service.registrarConsumo(1, VOTANTE_HASH);

    expect(saved[saved.length - 1].votosConsumidos).toBe(1);
    expect(estado).toMatchObject({
      revoteHabilitado: false,
      maxVotosPorVotante: 1,
      votosConsumidos: 1,
      intentosRestantes: 0,
      puedeVotar: false,
    });
  });

  it('crea el registro al primer consumo', async () => {
    const { service, saved } = createService();

    const estado = await service.registrarConsumo(1, VOTANTE_HASH);

    expect(saved.some((row) => row.votosConsumidos === 1)).toBe(true);
    expect(estado.votosConsumidos).toBe(1);
  });

  it('VOTAR-325 UAT-01: registrarConsumo lanza 429 con proximoReintentoEnSegundos mientras corre el cooldown', async () => {
    const { service } = createService({
      config: { minIntervaloSegundos: 900 },
      registro: {
        votosConsumidos: 1,
        ultimoIntentoAt: new Date(),
      },
    });

    try {
      await service.registrarConsumo(1, VOTANTE_HASH);
      throw new Error('expected registrarConsumo to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      const body = (error as HttpException).getResponse() as {
        proximoReintentoEnSegundos: number;
      };
      expect(body.proximoReintentoEnSegundos).toBeGreaterThan(0);
    }
  });

  it('VOTAR-325: registrarConsumo incrementa normalmente cuando el cooldown ya venció', async () => {
    const { service, saved } = createService({
      config: { minIntervaloSegundos: 60 },
      registro: {
        votosConsumidos: 1,
        ultimoIntentoAt: new Date(Date.now() - 120_000),
      },
    });

    const estado = await service.registrarConsumo(1, VOTANTE_HASH);

    expect(saved[saved.length - 1].votosConsumidos).toBe(2);
    expect(estado.votosConsumidos).toBe(2);
  });

  it('VOTAR-325: cooldown es por claveIntento (otro votante no queda bloqueado)', async () => {
    const otroHash = 'c'.repeat(64);
    const intentoRepository = {
      findOne: jest
        .fn()
        .mockImplementation(
          ({ where }: { where: { claveIntento: string } }) => {
            if (where.claveIntento === VOTANTE_HASH) {
              return Promise.resolve({
                idEleccion: 1,
                claveIntento: VOTANTE_HASH,
                votosConsumidos: 1,
                ultimoIntentoAt: new Date(),
              });
            }
            return Promise.resolve(null);
          },
        ),
      create: jest.fn((data: unknown) => data),
      save: jest.fn((entity: unknown) => Promise.resolve(entity)),
    };
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

  it('VOTAR-451: sync con votosObjetivo es idempotente ante doble llamada', async () => {
    const { service, storeRef } = createService({
      registro: { votosConsumidos: 0, ultimoIntentoAt: null },
    });

    const first = await service.registrarConsumo(1, VOTANTE_HASH, 1);
    const second = await service.registrarConsumo(1, VOTANTE_HASH, 1);

    expect(first.votosConsumidos).toBe(1);
    expect(second.votosConsumidos).toBe(1);
    expect(storeRef()?.votosConsumidos).toBe(1);
  });

  it('VOTAR-451: votosObjetivo sincroniza hacia el conteo on-chain sin pasarse del max', async () => {
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
