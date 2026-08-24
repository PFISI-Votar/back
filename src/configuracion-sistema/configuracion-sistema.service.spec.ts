/* eslint-disable @typescript-eslint/unbound-method */
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ElectoralImageService } from '@/common/images/electoral-image.service';
import { ConfiguracionSistemaService } from '@/configuracion-sistema/configuracion-sistema.service';
import {
  ACTA_APERTURA_MODO_DEFAULT,
  ACTA_APERTURA_PLANTILLA_DEFAULT,
  ACTA_CIERRE_PLANTILLA_DEFAULT,
  ConfiguracionSistema,
} from '@/configuracion-sistema/entities/configuracion-sistema.entity';

describe('ConfiguracionSistemaService', () => {
  let service: ConfiguracionSistemaService;
  let repository: {
    findOne: jest.Mock;
    save: jest.Mock;
    create: jest.Mock;
  };
  let electoralImageService: jest.Mocked<ElectoralImageService>;

  const mockConfiguracion = (
    overrides: Partial<ConfiguracionSistema> = {},
  ): ConfiguracionSistema => ({
    id: 1,
    logoUrl: null,
    actaAperturaPlantilla: ACTA_APERTURA_PLANTILLA_DEFAULT,
    actaAperturaModo: ACTA_APERTURA_MODO_DEFAULT,
    actaAperturaPlantillaTexto: null,
    actaCierrePlantilla: ACTA_CIERRE_PLANTILLA_DEFAULT,
    actaCierreModo: ACTA_APERTURA_MODO_DEFAULT,
    actaCierrePlantillaTexto: null,
    fechaActualizacion: new Date('2026-08-12T12:00:00Z'),
    ...overrides,
  });

  beforeEach(async () => {
    repository = {
      findOne: jest.fn(),
      save: jest.fn(),
      create: jest.fn(
        (input: Partial<ConfiguracionSistema>) => input as ConfiguracionSistema,
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConfiguracionSistemaService,
        {
          provide: getRepositoryToken(ConfiguracionSistema),
          useValue: repository,
        },
        {
          provide: ElectoralImageService,
          useValue: {
            saveImage: jest.fn(),
            deleteIfManagedUrl: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<ConfiguracionSistemaService>(
      ConfiguracionSistemaService,
    );
    electoralImageService = module.get(ElectoralImageService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('obtener', () => {
    it('returns the singleton configuration', async () => {
      repository.findOne.mockResolvedValue(mockConfiguracion());

      const result = await service.obtener();

      expect(result).toEqual({
        logoUrl: null,
        actaAperturaPlantilla: ACTA_APERTURA_PLANTILLA_DEFAULT,
        actaAperturaModo: ACTA_APERTURA_MODO_DEFAULT,
        actaAperturaPlantillaTexto: null,
        actaCierrePlantilla: ACTA_CIERRE_PLANTILLA_DEFAULT,
        actaCierreModo: ACTA_APERTURA_MODO_DEFAULT,
        actaCierrePlantillaTexto: null,
        fechaActualizacion: '2026-08-12T12:00:00.000Z',
      });
    });

    it('creates the singleton row when missing', async () => {
      repository.findOne.mockResolvedValue(null);
      repository.save.mockResolvedValue(mockConfiguracion());

      await service.obtener();

      expect(repository.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 1, logoUrl: null }),
      );
    });
  });

  describe('actualizarLogo', () => {
    it('saves the new logo and deletes the previous one', async () => {
      repository.findOne.mockResolvedValue(
        mockConfiguracion({ logoUrl: '/uploads/sistema/old.jpg' }),
      );
      electoralImageService.saveImage.mockResolvedValue(
        '/uploads/sistema/new.jpg',
      );
      repository.save.mockImplementation((entity) =>
        Promise.resolve(mockConfiguracion(entity)),
      );

      const file = {} as Express.Multer.File;
      const result = await service.actualizarLogo(file);

      expect(electoralImageService.saveImage).toHaveBeenCalledWith(
        file,
        'logo-institucional',
      );
      expect(repository.save).toHaveBeenCalledWith(
        expect.objectContaining({ logoUrl: '/uploads/sistema/new.jpg' }),
      );
      expect(electoralImageService.deleteIfManagedUrl).toHaveBeenCalledWith(
        '/uploads/sistema/old.jpg',
      );
      expect(result.logoUrl).toBe('/uploads/sistema/new.jpg');
    });
  });

  describe('eliminarLogo', () => {
    it('clears logoUrl and deletes the managed file', async () => {
      repository.findOne.mockResolvedValue(
        mockConfiguracion({ logoUrl: '/uploads/sistema/old.jpg' }),
      );
      repository.save.mockImplementation((entity) =>
        Promise.resolve(mockConfiguracion(entity)),
      );

      const result = await service.eliminarLogo();

      expect(repository.save).toHaveBeenCalledWith(
        expect.objectContaining({ logoUrl: null }),
      );
      expect(electoralImageService.deleteIfManagedUrl).toHaveBeenCalledWith(
        '/uploads/sistema/old.jpg',
      );
      expect(result.logoUrl).toBeNull();
    });
  });

  describe('actualizarPlantillaActaApertura', () => {
    it('merges the partial patch onto the existing plantilla', async () => {
      repository.findOne.mockResolvedValue(mockConfiguracion());
      repository.save.mockImplementation((entity) =>
        Promise.resolve(mockConfiguracion(entity)),
      );

      const result = await service.actualizarPlantillaActaApertura({
        incluirResumenPadron: false,
        incluirLogo: false,
      });

      expect(repository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          actaAperturaPlantilla: {
            ...ACTA_APERTURA_PLANTILLA_DEFAULT,
            incluirResumenPadron: false,
            incluirLogo: false,
          },
        }),
      );
      expect(result.actaAperturaPlantilla).toEqual({
        ...ACTA_APERTURA_PLANTILLA_DEFAULT,
        incluirResumenPadron: false,
        incluirLogo: false,
      });
    });
  });

  describe('actualizarFormatoPersonalizadoActaApertura', () => {
    it('updates only the fields present in the patch', async () => {
      repository.findOne.mockResolvedValue(mockConfiguracion());
      repository.save.mockImplementation((entity) =>
        Promise.resolve(mockConfiguracion(entity)),
      );

      const result = await service.actualizarFormatoPersonalizadoActaApertura({
        modo: 'PERSONALIZADO',
        plantillaTexto: 'Acta de {{nombreEleccion}}',
      });

      expect(repository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          actaAperturaModo: 'PERSONALIZADO',
          actaAperturaPlantillaTexto: 'Acta de {{nombreEleccion}}',
        }),
      );
      expect(result.actaAperturaModo).toBe('PERSONALIZADO');
      expect(result.actaAperturaPlantillaTexto).toBe(
        'Acta de {{nombreEleccion}}',
      );
    });

    it('leaves fields unset when omitted from the patch', async () => {
      repository.findOne.mockResolvedValue(
        mockConfiguracion({
          actaAperturaModo: 'PERSONALIZADO',
          actaAperturaPlantillaTexto: 'texto existente',
        }),
      );
      repository.save.mockImplementation((entity) =>
        Promise.resolve(mockConfiguracion(entity)),
      );

      const result = await service.actualizarFormatoPersonalizadoActaApertura({
        modo: 'SIMPLE',
      });

      expect(result.actaAperturaModo).toBe('SIMPLE');
      expect(result.actaAperturaPlantillaTexto).toBe('texto existente');
    });
  });

  describe('actualizarPlantillaActaCierre', () => {
    it('merges the partial patch onto the existing plantilla', async () => {
      repository.findOne.mockResolvedValue(mockConfiguracion());
      repository.save.mockImplementation((entity) =>
        Promise.resolve(mockConfiguracion(entity)),
      );

      const result = await service.actualizarPlantillaActaCierre({
        incluirResultadosPorLista: false,
        incluirLogo: false,
      });

      expect(repository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          actaCierrePlantilla: {
            ...ACTA_CIERRE_PLANTILLA_DEFAULT,
            incluirResultadosPorLista: false,
            incluirLogo: false,
          },
        }),
      );
      expect(result.actaCierrePlantilla).toEqual({
        ...ACTA_CIERRE_PLANTILLA_DEFAULT,
        incluirResultadosPorLista: false,
        incluirLogo: false,
      });
    });
  });

  describe('actualizarFormatoPersonalizadoActaCierre', () => {
    it('updates only the fields present in the patch', async () => {
      repository.findOne.mockResolvedValue(mockConfiguracion());
      repository.save.mockImplementation((entity) =>
        Promise.resolve(mockConfiguracion(entity)),
      );

      const result = await service.actualizarFormatoPersonalizadoActaCierre({
        modo: 'PERSONALIZADO',
        plantillaTexto: 'Escrutinio de {{nombreEleccion}}',
      });

      expect(repository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          actaCierreModo: 'PERSONALIZADO',
          actaCierrePlantillaTexto: 'Escrutinio de {{nombreEleccion}}',
        }),
      );
      expect(result.actaCierreModo).toBe('PERSONALIZADO');
      expect(result.actaCierrePlantillaTexto).toBe(
        'Escrutinio de {{nombreEleccion}}',
      );
    });

    it('leaves fields unset when omitted from the patch', async () => {
      repository.findOne.mockResolvedValue(
        mockConfiguracion({
          actaCierreModo: 'PERSONALIZADO',
          actaCierrePlantillaTexto: 'texto existente',
        }),
      );
      repository.save.mockImplementation((entity) =>
        Promise.resolve(mockConfiguracion(entity)),
      );

      const result = await service.actualizarFormatoPersonalizadoActaCierre({
        modo: 'SIMPLE',
      });

      expect(result.actaCierreModo).toBe('SIMPLE');
      expect(result.actaCierrePlantillaTexto).toBe('texto existente');
    });
  });
});
