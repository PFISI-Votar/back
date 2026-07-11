/* eslint-disable @typescript-eslint/unbound-method */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual } from 'typeorm';
import { AperturaAutomaticaScheduler } from './apertura-automatica.scheduler';
import { AperturaComicioService } from './apertura-comicio.service';
import { Eleccion } from '@/eleccion/entities/eleccion.entity';
import { EleccionEstado } from '@/eleccion/enums/eleccion-estado.enum';

describe('AperturaAutomaticaScheduler', () => {
  let scheduler: AperturaAutomaticaScheduler;
  let eleccionRepository: jest.Mocked<Repository<Eleccion>>;
  let aperturaComicioService: jest.Mocked<AperturaComicioService>;

  const mockEleccionConfigurada: Eleccion = {
    idEleccion: 1,
    nombre: 'Elección Test',
    descripcion: 'Descripción de prueba',
    estado: EleccionEstado.CONFIGURADA,
    fechaInicio: new Date('2025-10-15T08:00:00Z'),
    fechaFin: new Date('2025-10-15T18:00:00Z'),
    tipoVotacion: 'UNICA_LISTA',
    fechaCreacion: new Date(),
    fechaActualizacion: new Date(),
  } as Eleccion;

  beforeEach(async () => {
    const mockEleccionRepository = {
      find: jest.fn(),
    };

    const mockAperturaComicioService = {
      abrirAutomatico: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AperturaAutomaticaScheduler,
        {
          provide: getRepositoryToken(Eleccion),
          useValue: mockEleccionRepository,
        },
        {
          provide: AperturaComicioService,
          useValue: mockAperturaComicioService,
        },
      ],
    }).compile();

    scheduler = module.get<AperturaAutomaticaScheduler>(
      AperturaAutomaticaScheduler,
    );
    eleccionRepository = module.get(getRepositoryToken(Eleccion));
    aperturaComicioService = module.get(AperturaComicioService);

    // Evitar que onModuleInit inicie el scheduler automáticamente
    jest.spyOn(scheduler as any, 'startScheduler').mockImplementation();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('checkAndOpenElections', () => {
    it('debe abrir elecciones CONFIGURADAS cuya fecha de inicio ya pasó', async () => {
      const now = new Date('2025-10-15T09:00:00Z'); // 1 hora después de fechaInicio
      jest.spyOn(global, 'Date').mockImplementation(() => now);

      eleccionRepository.find.mockResolvedValue([mockEleccionConfigurada]);
      aperturaComicioService.abrirAutomatico.mockResolvedValue({
        idEleccion: 1,
        estado: EleccionEstado.ABIERTA,
        fechaApertura: now,
        modo: 'AUTOMATICO',
      });

      await (scheduler as any).checkAndOpenElections();

      expect(eleccionRepository.find).toHaveBeenCalledWith({
        where: {
          estado: EleccionEstado.CONFIGURADA,
          fechaInicio: LessThanOrEqual(now),
        },
      });
      expect(aperturaComicioService.abrirAutomatico).toHaveBeenCalledWith(1);
      expect(aperturaComicioService.abrirAutomatico).toHaveBeenCalledTimes(1);
    });

    it('no debe hacer nada si no hay elecciones para abrir', async () => {
      eleccionRepository.find.mockResolvedValue([]);

      await (scheduler as any).checkAndOpenElections();

      expect(eleccionRepository.find).toHaveBeenCalled();
      expect(aperturaComicioService.abrirAutomatico).not.toHaveBeenCalled();
    });

    it('debe procesar múltiples elecciones para abrir', async () => {
      const mockEleccion2: Eleccion = {
        ...mockEleccionConfigurada,
        idEleccion: 2,
        nombre: 'Elección Test 2',
      };

      eleccionRepository.find.mockResolvedValue([
        mockEleccionConfigurada,
        mockEleccion2,
      ]);
      aperturaComicioService.abrirAutomatico.mockResolvedValue({
        idEleccion: 1,
        estado: EleccionEstado.ABIERTA,
        fechaApertura: new Date(),
        modo: 'AUTOMATICO',
      });

      await (scheduler as any).checkAndOpenElections();

      expect(aperturaComicioService.abrirAutomatico).toHaveBeenCalledWith(1);
      expect(aperturaComicioService.abrirAutomatico).toHaveBeenCalledWith(2);
      expect(aperturaComicioService.abrirAutomatico).toHaveBeenCalledTimes(2);
    });

    it('debe continuar procesando elecciones aunque falle una', async () => {
      const mockEleccion2: Eleccion = {
        ...mockEleccionConfigurada,
        idEleccion: 2,
        nombre: 'Elección Test 2',
      };

      eleccionRepository.find.mockResolvedValue([
        mockEleccionConfigurada,
        mockEleccion2,
      ]);
      aperturaComicioService.abrirAutomatico
        .mockRejectedValueOnce(new Error('Merkle no publicado'))
        .mockResolvedValueOnce({
          idEleccion: 2,
          estado: EleccionEstado.ABIERTA,
          fechaApertura: new Date(),
          modo: 'AUTOMATICO',
        });

      await (scheduler as any).checkAndOpenElections();

      expect(aperturaComicioService.abrirAutomatico).toHaveBeenCalledTimes(2);
      // Verificar que el segundo sí se procesó a pesar del error en el primero
      expect(aperturaComicioService.abrirAutomatico).toHaveBeenCalledWith(2);
    });

    it('debe manejar errores del repositorio sin romper', async () => {
      eleccionRepository.find.mockRejectedValue(
        new Error('Database connection error'),
      );

      // No debe lanzar error
      await expect(
        (scheduler as any).checkAndOpenElections(),
      ).resolves.not.toThrow();

      expect(aperturaComicioService.abrirAutomatico).not.toHaveBeenCalled();
    });
  });

  describe('Lifecycle hooks', () => {
    it('onModuleInit debe iniciar el scheduler', () => {
      const startSchedulerSpy = jest
        .spyOn(scheduler as any, 'startScheduler')
        .mockImplementation();

      scheduler.onModuleInit();

      expect(startSchedulerSpy).toHaveBeenCalled();
    });

    it('onModuleDestroy debe detener el intervalo', () => {
      const clearIntervalSpy = jest.spyOn(global, 'clearInterval');
      (scheduler as any).intervalId = 12345;

      scheduler.onModuleDestroy();

      expect(clearIntervalSpy).toHaveBeenCalledWith(12345);
    });
  });
});
