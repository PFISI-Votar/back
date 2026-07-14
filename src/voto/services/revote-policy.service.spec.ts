import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PoliticaRevoto } from '@/eleccion/configuracion-comicio/enums/politica-revoto.enum';
import { EleccionEstado } from '@/eleccion/enums/eleccion-estado.enum';
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
    options?.config === null
      ? null
      : { ...baseConfig, ...options?.config };
  const registro =
    options && 'registro' in options ? options.registro : null;
  const estado =
    options && 'estado' in options
      ? options.estado
      : EleccionEstado.ABIERTA;

  const saved: Array<{
    idEleccion: number;
    votanteHash: string;
    votosConsumidos: number;
    ultimoIntentoAt: Date | null;
  }> = [];

  const eleccionRepository = {
    findOne: jest.fn().mockResolvedValue(
      estado === null ? null : { idEleccion: 1, estado },
    ),
  };
  const configuracionRepository = {
    findOne: jest.fn().mockResolvedValue(config),
  };
  const intentoRepository = {
    findOne: jest.fn().mockResolvedValue(
      registro
        ? {
            idEleccion: 1,
            votanteHash: VOTANTE_HASH,
            votosConsumidos: registro.votosConsumidos,
            ultimoIntentoAt: registro.ultimoIntentoAt,
          }
        : null,
    ),
    create: jest.fn((data: (typeof saved)[number]) => ({ ...data })),
    save: jest.fn(async (entity: (typeof saved)[number]) => {
      saved.push(entity);
      return entity;
    }),
  };

  const service = new RevotePolicyService(
    eleccionRepository as never,
    configuracionRepository as never,
    intentoRepository as never,
  );

  return { service, saved };
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

    expect(saved[0].votosConsumidos).toBe(3);
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

  it('no incrementa consumos por encima del máximo', async () => {
    const { service, saved } = createService({
      registro: { votosConsumidos: 3, ultimoIntentoAt: new Date() },
    });

    const estado = await service.registrarConsumo(1, VOTANTE_HASH);

    expect(saved).toHaveLength(0);
    expect(estado.votosConsumidos).toBe(3);
    expect(estado.intentosRestantes).toBe(0);
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
