import { Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { EleccionGateway } from '@/eleccion/gateways/eleccion.gateway';
import { EscrutinioPollerService } from '@/escrutinio/services/escrutinio-poller.service';
import { EscrutinioService } from '@/escrutinio/services/escrutinio.service';
import { EscrutinioResponseDto } from '@/escrutinio/dto/escrutinio-response.dto';
import { EleccionEstado } from '@/eleccion/enums/eleccion-estado.enum';

describe('EscrutinioPollerService — VOTAR-364', () => {
  let poller: EscrutinioPollerService;
  let escrutinioService: jest.Mocked<
    Pick<
      EscrutinioService,
      'listarComiciosParaPolling' | 'refreshAndDetectChange'
    >
  >;
  let gateway: jest.Mocked<Pick<EleccionGateway, 'emitResultadosActualizados'>>;

  beforeEach(async () => {
    jest.useFakeTimers();
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);

    escrutinioService = {
      listarComiciosParaPolling: jest.fn(),
      refreshAndDetectChange: jest.fn(),
    };
    gateway = {
      emitResultadosActualizados: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EscrutinioPollerService,
        { provide: EscrutinioService, useValue: escrutinioService },
        { provide: EleccionGateway, useValue: gateway },
      ],
    }).compile();

    poller = module.get(EscrutinioPollerService);
  });

  afterEach(() => {
    poller.onModuleDestroy();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('emits WebSocket only when tallies change', async () => {
    const snapshot = {
      idEleccion: 3,
      actualizadoEn: '2026-07-20T12:00:00.000Z',
      participacion: { totalVotos: 5 },
      estado: EleccionEstado.ABIERTA,
      congelado: false,
    } as EscrutinioResponseDto;

    escrutinioService.listarComiciosParaPolling.mockResolvedValue([3]);
    escrutinioService.refreshAndDetectChange
      .mockResolvedValueOnce({ changed: true, snapshot })
      .mockResolvedValueOnce({ changed: false, snapshot });

    poller.onModuleInit();
    await jest.advanceTimersByTimeAsync(4_000);
    expect(gateway.emitResultadosActualizados).toHaveBeenCalledWith({
      idEleccion: 3,
      actualizadoEn: snapshot.actualizadoEn,
      totalVotos: 5,
    });

    gateway.emitResultadosActualizados.mockClear();
    await jest.advanceTimersByTimeAsync(4_000);
    expect(gateway.emitResultadosActualizados).not.toHaveBeenCalled();
  });
});
