import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AuditLoggerService } from '@/audit/audit-logger.service';
import { ConfiguracionComicioService } from '@/eleccion/configuracion-comicio/services/configuracion-comicio.service';
import { ConfiguracionComicio } from '@/eleccion/configuracion-comicio/entities/configuracion-comicio.entity';
import { MetodoAutenticacion } from '@/eleccion/configuracion-comicio/enums/metodo-autenticacion.enum';
import { PoliticaRevoto } from '@/eleccion/configuracion-comicio/enums/politica-revoto.enum';
import { Eleccion } from '@/eleccion/entities/eleccion.entity';
import { EleccionEstado } from '@/eleccion/enums/eleccion-estado.enum';
import { CrearEleccionValidationException } from '@/eleccion/exceptions/crear-eleccion-validation.exception';

describe('ConfiguracionComicioService', () => {
  let service: ConfiguracionComicioService;

  const mockConfigRepository = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
  };

  const mockEleccionRepository = {
    findOne: jest.fn(),
  };

  const mockAuditLoggerService = {
    logConfigModificada: jest.fn().mockResolvedValue(undefined),
  };

  const baseConfig: ConfiguracionComicio = {
    idConfiguracion: 1,
    idEleccion: 1,
    metodosAutenticacion: [MetodoAutenticacion.SSO_INSTITUCIONAL],
    permitirVotoEnBlanco: false,
    permitirVotoMultiple: false,
    maxVotosPorVotante: 1,
    minIntervaloSegundos: 0,
    mostrarResultadosTiempoReal: false,
    duracionMinutos: null,
    politicaRevoto: PoliticaRevoto.DISABLED,
  } as ConfiguracionComicio;

  const baseEleccion: Eleccion = {
    idEleccion: 1,
    estado: EleccionEstado.BORRADOR,
  } as Eleccion;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConfiguracionComicioService,
        {
          provide: getRepositoryToken(ConfiguracionComicio),
          useValue: mockConfigRepository,
        },
        {
          provide: getRepositoryToken(Eleccion),
          useValue: mockEleccionRepository,
        },
        {
          provide: AuditLoggerService,
          useValue: mockAuditLoggerService,
        },
      ],
    }).compile();

    service = module.get<ConfiguracionComicioService>(
      ConfiguracionComicioService,
    );
  });

  afterEach(() => jest.clearAllMocks());

  it('UAT-04: debe lanzar 422 si no hay métodos de autenticación', () => {
    expect(() => service.assertMetodosAutenticacionValidos([])).toThrow(
      CrearEleccionValidationException,
    );
  });

  it('debe crear configuración inicial con métodos de autenticación', async () => {
    const metodos = [MetodoAutenticacion.SSO_INSTITUCIONAL];
    const configMock = {
      idConfiguracion: 1,
      idEleccion: 1,
      metodosAutenticacion: metodos,
    };
    mockConfigRepository.create.mockReturnValue(configMock);
    mockConfigRepository.save.mockResolvedValue(configMock);

    const result = await service.crearConfiguracionInicial(1, metodos);

    expect(result.metodosAutenticacion).toEqual(metodos);
    expect(mockConfigRepository.save).toHaveBeenCalledTimes(1);
  });

  describe('VOTAR-323 configuracion-revoto', () => {
    beforeEach(() => {
      mockEleccionRepository.findOne.mockResolvedValue({ ...baseEleccion });
      mockConfigRepository.findOne.mockResolvedValue({ ...baseConfig });
      mockConfigRepository.save.mockImplementation(
        (entity: ConfiguracionComicio) => Promise.resolve(entity),
      );
    });

    it('obtenerConfiguracionRevoto refleja estado persistido', async () => {
      const actual = await service.obtenerConfiguracionRevoto(1);
      expect(actual).toEqual({
        idEleccion: 1,
        permitirVotoMultiple: false,
        maxVotosPorVotante: 1,
        minIntervaloSegundos: 0,
        politicaRevoto: PoliticaRevoto.DISABLED,
        editable: true,
      });
    });

    it('guardar con re-voto off fuerza maxVotos=1 y politica DISABLED', async () => {
      const config = {
        ...baseConfig,
        permitirVotoMultiple: true,
        maxVotosPorVotante: 3,
        politicaRevoto: PoliticaRevoto.LAST_VOTE_WINS,
      };
      mockConfigRepository.findOne.mockResolvedValue(config);

      const actual = await service.guardarConfiguracionRevoto(
        1,
        { permitirVotoMultiple: false },
        { actorId: 'admin-1' },
      );

      expect(actual.permitirVotoMultiple).toBe(false);
      expect(actual.maxVotosPorVotante).toBe(1);
      expect(actual.politicaRevoto).toBe(PoliticaRevoto.DISABLED);
      expect(mockConfigRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          maxVotosPorVotante: 1,
          politicaRevoto: PoliticaRevoto.DISABLED,
        }),
      );
    });

    it('UAT-02: rechaza maxVotosPorVotante > 1 cuando re-voto está inactivo', async () => {
      await expect(
        service.guardarConfiguracionRevoto(
          1,
          { permitirVotoMultiple: false, maxVotosPorVotante: 5 },
          { actorId: 'admin-1' },
        ),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('VOTAR-324: acepta maxVotosPorVotante=10 (tope superior) con re-voto activo', async () => {
      const actual = await service.guardarConfiguracionRevoto(
        1,
        { permitirVotoMultiple: true, maxVotosPorVotante: 10 },
        { actorId: 'admin-1' },
      );

      expect(actual.maxVotosPorVotante).toBe(10);
      expect(mockConfigRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ maxVotosPorVotante: 10 }),
      );
    });

    it('UAT-02: rechaza maxVotosPorVotante=15 (fuera de [1,10]) con 422 y no persiste', async () => {
      await expect(
        service.guardarConfiguracionRevoto(
          1,
          { permitirVotoMultiple: true, maxVotosPorVotante: 15 },
          { actorId: 'admin-1' },
        ),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(mockConfigRepository.save).not.toHaveBeenCalled();
    });

    it('VOTAR-324: rechaza maxVotosPorVotante=0 con 422', async () => {
      await expect(
        service.guardarConfiguracionRevoto(
          1,
          { permitirVotoMultiple: true, maxVotosPorVotante: 0 },
          { actorId: 'admin-1' },
        ),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(mockConfigRepository.save).not.toHaveBeenCalled();
    });

    it('VOTAR-325: acepta minIntervaloSegundos=3600 (tope superior) con re-voto activo', async () => {
      const actual = await service.guardarConfiguracionRevoto(
        1,
        {
          permitirVotoMultiple: true,
          maxVotosPorVotante: 2,
          minIntervaloSegundos: 3600,
        },
        { actorId: 'admin-1' },
      );

      expect(actual.minIntervaloSegundos).toBe(3600);
      expect(mockConfigRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ minIntervaloSegundos: 3600 }),
      );
    });

    it('UAT-01: rechaza minIntervaloSegundos=3601 (fuera de [0,3600]) con 422 y no persiste', async () => {
      await expect(
        service.guardarConfiguracionRevoto(
          1,
          {
            permitirVotoMultiple: true,
            maxVotosPorVotante: 2,
            minIntervaloSegundos: 3601,
          },
          { actorId: 'admin-1' },
        ),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(mockConfigRepository.save).not.toHaveBeenCalled();
    });

    it('rechaza minIntervaloSegundos > 0 cuando re-voto está inactivo', async () => {
      await expect(
        service.guardarConfiguracionRevoto(
          1,
          { permitirVotoMultiple: false, minIntervaloSegundos: 60 },
          { actorId: 'admin-1' },
        ),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(mockConfigRepository.save).not.toHaveBeenCalled();
    });

    it('deshabilitar re-voto resetea minIntervaloSegundos a 0', async () => {
      const config = {
        ...baseConfig,
        permitirVotoMultiple: true,
        maxVotosPorVotante: 3,
        minIntervaloSegundos: 300,
        politicaRevoto: PoliticaRevoto.LAST_VOTE_WINS,
      };
      mockConfigRepository.findOne.mockResolvedValue(config);

      const actual = await service.guardarConfiguracionRevoto(
        1,
        { permitirVotoMultiple: false },
        { actorId: 'admin-1' },
      );

      expect(actual.minIntervaloSegundos).toBe(0);
      expect(mockConfigRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ minIntervaloSegundos: 0 }),
      );
    });

    it('lanza 409 si el comicio no está en BORRADOR', async () => {
      mockEleccionRepository.findOne.mockResolvedValue({
        ...baseEleccion,
        estado: EleccionEstado.CONFIGURADA,
      });

      await expect(
        service.guardarConfiguracionRevoto(
          1,
          { permitirVotoMultiple: true },
          { actorId: 'admin-1' },
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('registra audit log al modificar re-voto', async () => {
      await service.guardarConfiguracionRevoto(
        1,
        { permitirVotoMultiple: true },
        { actorId: 'admin-1', ipOrigen: '127.0.0.1' },
      );

      expect(mockConfigRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          permitirVotoMultiple: true,
          maxVotosPorVotante: 2,
          politicaRevoto: PoliticaRevoto.LAST_VOTE_WINS,
        }),
      );
      expect(mockAuditLoggerService.logConfigModificada).toHaveBeenCalledWith(
        expect.objectContaining({
          idEleccion: 1,
          actorId: 'admin-1',
          ipOrigen: '127.0.0.1',
        }),
      );
    });

    it('VOTAR-323: habilitar re-voto fuerza mínimo 2 sufragios aunque el payload indique 1', async () => {
      const actual = await service.guardarConfiguracionRevoto(
        1,
        { permitirVotoMultiple: true, maxVotosPorVotante: 2 },
        { actorId: 'admin-1' },
      );

      expect(actual.maxVotosPorVotante).toBe(2);
      expect(mockConfigRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ maxVotosPorVotante: 2 }),
      );
    });

    it('lanza 404 si la elección no existe', async () => {
      mockEleccionRepository.findOne.mockResolvedValue(null);

      await expect(
        service.obtenerConfiguracionRevoto(99),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
