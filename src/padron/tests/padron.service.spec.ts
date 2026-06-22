import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PadronService } from '../padron.service';
import {
  CrearPadronInput,
  PADRON_REPOSITORY,
} from '../interfaces/padron.repository.interface';
import { PadronEstado } from '../enums/padron-estado.enum';
import { TipoNovedad } from '../enums/tipo-novedad.enum';
import { EleccionEstado } from '../../eleccion/enums/eleccion-estado.enum';

const REGEX_KECCAK = /^[0-9a-f]{64}$/;
const ID_ELECCION = 42;

const mockPadronRepository = {
  buscarEleccionPorId: jest.fn(),
  existePadronParaEleccion: jest.fn(),
  crearPadronConVotantes: jest.fn(),
  obtenerPadronPorEleccion: jest.fn(),
  listarVotantesPaginado: jest.fn(),
  eliminarPadronPorEleccion: jest.fn(),
};

/** Construye un archivo CSV simulado en memoria (como lo entrega multer). */
function buildCsvFile(contenido: string): Express.Multer.File {
  const buffer = Buffer.from(contenido, 'utf-8');
  return {
    fieldname: 'file',
    originalname: 'padron.csv',
    encoding: '7bit',
    mimetype: 'text/csv',
    size: buffer.length,
    buffer,
  } as Express.Multer.File;
}

/** Genera un CSV de `cantidad` registros válidos y únicos. */
function buildCsvValido(cantidad: number): Express.Multer.File {
  const filas = ['dni,email'];
  for (let i = 0; i < cantidad; i++) {
    const dni = (30000000 + i).toString();
    filas.push(`${dni},votante${i}@frvm.utn.edu.ar`);
  }
  return buildCsvFile(filas.join('\n'));
}

/**
 * Construye el archivo canónico de UAT-01: 105 filas de datos compuestas por
 * 100 identidades únicas válidas, 3 con campos obligatorios nulos y 2
 * duplicados de filas previas. Resultado esperado: 100 importadas, 5 omitidas.
 */
function buildCsvUat01(): Express.Multer.File {
  const filas = ['dni,email'];
  for (let i = 0; i < 100; i++) {
    const dni = (30000000 + i).toString();
    filas.push(`${dni},votante${i}@frvm.utn.edu.ar`);
  }
  // 3 filas con campos obligatorios nulos
  filas.push(',sin-dni@frvm.utn.edu.ar');
  filas.push('30000200,');
  filas.push(',');
  // 2 duplicados de identidades ya cargadas
  filas.push('30000000,votante0@frvm.utn.edu.ar');
  filas.push('30000001,votante1@frvm.utn.edu.ar');
  return buildCsvFile(filas.join('\n'));
}

describe('PadronService', () => {
  let service: PadronService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PadronService,
        { provide: PADRON_REPOSITORY, useValue: mockPadronRepository },
      ],
    }).compile();

    service = module.get<PadronService>(PadronService);

    mockPadronRepository.buscarEleccionPorId.mockResolvedValue({
      idEleccion: ID_ELECCION,
      estado: EleccionEstado.BORRADOR,
    });
    mockPadronRepository.existePadronParaEleccion.mockResolvedValue(false);
    mockPadronRepository.crearPadronConVotantes.mockImplementation(
      (input: CrearPadronInput) =>
        Promise.resolve({
          idPadron: 1,
          estado: PadronEstado.BORRADOR,
          fechaGeneracion: new Date('2026-06-20T00:00:00Z'),
          totalVotantesHabilitados: input.hashesHoja.length,
        }),
    );
  });

  afterEach(() => jest.clearAllMocks());

  it('UAT-01: debe importar un padrón limpio de 1000 registros sin fallos', async () => {
    const inputArchivo = buildCsvValido(1000);

    const actual = await service.importarPadron(ID_ELECCION, inputArchivo);

    expect(actual.totalImportados).toBe(1000);
    expect(actual.idEleccion).toBe(ID_ELECCION);
    expect(actual.estado).toBe(PadronEstado.BORRADOR);
    expect(mockPadronRepository.crearPadronConVotantes).toHaveBeenCalledTimes(
      1,
    );

    const inputPersistido = (
      mockPadronRepository.crearPadronConVotantes.mock
        .calls as CrearPadronInput[][]
    )[0][0];
    expect(inputPersistido.hashesHoja).toHaveLength(1000);
  });

  it('UAT-02: debe persistir únicamente hashes Keccak-256, sin texto plano de identidad', async () => {
    const inputDni = '30111222';
    const inputEmail = 'ana@frvm.utn.edu.ar';
    const inputArchivo = buildCsvFile(`dni,email\n${inputDni},${inputEmail}`);

    await service.importarPadron(ID_ELECCION, inputArchivo);

    const inputPersistido = (
      mockPadronRepository.crearPadronConVotantes.mock
        .calls as CrearPadronInput[][]
    )[0][0];

    // Toda hoja persistida es un hash Keccak-256 de 64 hex (256 bits)
    inputPersistido.hashesHoja.forEach((hash: string) => {
      expect(hash).toMatch(REGEX_KECCAK);
    });

    // Ningún dato sensible en texto plano llega a la capa de persistencia
    const cargaSerializada = JSON.stringify(inputPersistido);
    expect(cargaSerializada).not.toContain(inputDni);
    expect(cargaSerializada).not.toContain(inputEmail);
  });

  it('debe deduplicar identidades repetidas y reportar el duplicado', async () => {
    const inputArchivo = buildCsvFile(
      'dni,email\n30111222,ana@frvm.utn.edu.ar\n30111222,ana@frvm.utn.edu.ar',
    );

    const actual = await service.importarPadron(ID_ELECCION, inputArchivo);

    expect(actual.totalImportados).toBe(1);
    expect(actual.totalOmitidos).toBe(1);
    expect(actual.novedades).toEqual([
      {
        linea: 3,
        tipo: TipoNovedad.DUPLICADO,
        motivo:
          'Línea 3: Registro duplicado - Se preservó la primera aparición',
      },
    ]);
  });

  it('debe omitir el registro con DNI inválido y continuar con el resto', async () => {
    const inputArchivo = buildCsvFile(
      'dni,email\nABC,carla@frvm.utn.edu.ar\n30222333,bruno@frvm.utn.edu.ar',
    );

    const actual = await service.importarPadron(ID_ELECCION, inputArchivo);

    expect(actual.totalImportados).toBe(1);
    expect(actual.totalOmitidos).toBe(1);
    expect(actual.novedades[0]).toEqual({
      linea: 2,
      tipo: TipoNovedad.DNI_INVALIDO,
      motivo: 'Línea 2: DNI con formato inválido',
    });
    expect(mockPadronRepository.crearPadronConVotantes).toHaveBeenCalledTimes(
      1,
    );
  });

  it('debe omitir el registro con email inválido y continuar con el resto', async () => {
    const inputArchivo = buildCsvFile(
      'dni,email\n30111222,no-es-email\n30222333,bruno@frvm.utn.edu.ar',
    );

    const actual = await service.importarPadron(ID_ELECCION, inputArchivo);

    expect(actual.totalImportados).toBe(1);
    expect(actual.totalOmitidos).toBe(1);
    expect(actual.novedades[0]).toEqual({
      linea: 2,
      tipo: TipoNovedad.EMAIL_INVALIDO,
      motivo: 'Línea 2: Email con formato inválido',
    });
  });

  it('debe cancelar (400) ante un archivo sin registros', async () => {
    const inputArchivo = buildCsvFile('dni,email');

    await expect(
      service.importarPadron(ID_ELECCION, inputArchivo),
    ).rejects.toThrow(BadRequestException);
    expect(mockPadronRepository.crearPadronConVotantes).not.toHaveBeenCalled();
  });

  it('debe cancelar (400) si el archivo no tiene las columnas requeridas', async () => {
    const inputArchivo = buildCsvFile(
      'tipo_documento;numero_documento;observacion\nDNI;12345678;texto suelto',
    );

    await expect(
      service.importarPadron(ID_ELECCION, inputArchivo),
    ).rejects.toThrow(BadRequestException);
    expect(mockPadronRepository.crearPadronConVotantes).not.toHaveBeenCalled();
  });

  it('UAT-01: importa 100 únicas y omite 5 (3 campos nulos + 2 duplicados) sobre 105 filas', async () => {
    const inputArchivo = buildCsvUat01();

    const actual = await service.importarPadron(ID_ELECCION, inputArchivo);

    expect(actual.totalProcesados).toBe(105);
    expect(actual.totalImportados).toBe(100);
    expect(actual.totalOmitidos).toBe(5);
    expect(actual.novedades).toHaveLength(5);

    // El reporte se persiste para re-descarga (sin PII).
    const inputPersistido = (
      mockPadronRepository.crearPadronConVotantes.mock
        .calls as CrearPadronInput[][]
    )[0][0];
    expect(inputPersistido.totalProcesados).toBe(105);
    expect(inputPersistido.totalOmitidos).toBe(5);
    expect(inputPersistido.novedades).toHaveLength(5);
  });

  it('UAT-02: el reporte de novedades lista número de línea exacto, motivo por tipo y ordenado', async () => {
    // Línea 2 válida; 3 DNI ausente; 4 email ausente; 5 DNI inválido;
    // 6 email inválido; 7 duplicado de la línea 2.
    const inputArchivo = buildCsvFile(
      [
        'dni,email',
        '30111222,ana@frvm.utn.edu.ar',
        ',elena@frvm.utn.edu.ar',
        '30666777,',
        'ABC,franco@frvm.utn.edu.ar',
        '30888999,no-es-email',
        '30111222,ana@frvm.utn.edu.ar',
      ].join('\n'),
    );

    const actual = await service.importarPadron(ID_ELECCION, inputArchivo);

    expect(actual.totalImportados).toBe(1);
    expect(actual.novedades).toEqual([
      {
        linea: 3,
        tipo: TipoNovedad.DNI_AUSENTE,
        motivo: 'Línea 3: Campo DNI ausente',
      },
      {
        linea: 4,
        tipo: TipoNovedad.EMAIL_AUSENTE,
        motivo: 'Línea 4: Campo email ausente',
      },
      {
        linea: 5,
        tipo: TipoNovedad.DNI_INVALIDO,
        motivo: 'Línea 5: DNI con formato inválido',
      },
      {
        linea: 6,
        tipo: TipoNovedad.EMAIL_INVALIDO,
        motivo: 'Línea 6: Email con formato inválido',
      },
      {
        linea: 7,
        tipo: TipoNovedad.DUPLICADO,
        motivo:
          'Línea 7: Registro duplicado - Se preservó la primera aparición',
      },
    ]);
  });

  it('debe rechazar (404) si la elección no existe', async () => {
    mockPadronRepository.buscarEleccionPorId.mockResolvedValue(null);

    await expect(
      service.importarPadron(ID_ELECCION, buildCsvValido(1)),
    ).rejects.toThrow(NotFoundException);
  });

  it('debe rechazar (422) si la elección no está en estado BORRADOR', async () => {
    mockPadronRepository.buscarEleccionPorId.mockResolvedValue({
      idEleccion: ID_ELECCION,
      estado: EleccionEstado.ABIERTA,
    });

    await expect(
      service.importarPadron(ID_ELECCION, buildCsvValido(1)),
    ).rejects.toThrow(UnprocessableEntityException);
  });

  it('debe rechazar (409) si la elección ya tiene un padrón cargado', async () => {
    mockPadronRepository.existePadronParaEleccion.mockResolvedValue(true);

    await expect(
      service.importarPadron(ID_ELECCION, buildCsvValido(1)),
    ).rejects.toThrow(ConflictException);
  });

  describe('obtenerResumen', () => {
    it('debe devolver el resumen del padrón existente con los totales de importación', async () => {
      mockPadronRepository.obtenerPadronPorEleccion.mockResolvedValue({
        idPadron: 7,
        totalVotantesHabilitados: 1000,
        hashPadron: 'a'.repeat(64),
        estado: PadronEstado.BORRADOR,
        fechaGeneracion: new Date('2026-06-20T00:00:00Z'),
        totalProcesados: 1005,
        totalOmitidos: 5,
        novedades: [],
      });

      const actual = await service.obtenerResumen(ID_ELECCION);

      expect(actual).toEqual({
        idPadron: 7,
        idEleccion: ID_ELECCION,
        totalVotantesHabilitados: 1000,
        hashPadron: 'a'.repeat(64),
        estado: PadronEstado.BORRADOR,
        fechaGeneracion: new Date('2026-06-20T00:00:00Z'),
        totalProcesados: 1005,
        totalOmitidos: 5,
      });
    });

    it('debe rechazar (404) si la elección no tiene padrón', async () => {
      mockPadronRepository.obtenerPadronPorEleccion.mockResolvedValue(null);

      await expect(service.obtenerResumen(ID_ELECCION)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('obtenerReporteNovedades', () => {
    it('debe devolver el reporte persistido (totales + novedades)', async () => {
      const novedadesPersistidas = [
        {
          linea: 3,
          tipo: TipoNovedad.DNI_AUSENTE,
          motivo: 'Línea 3: Campo DNI ausente',
        },
      ];
      mockPadronRepository.obtenerPadronPorEleccion.mockResolvedValue({
        idPadron: 7,
        totalVotantesHabilitados: 100,
        hashPadron: 'a'.repeat(64),
        estado: PadronEstado.BORRADOR,
        fechaGeneracion: new Date('2026-06-20T00:00:00Z'),
        totalProcesados: 105,
        totalOmitidos: 5,
        novedades: novedadesPersistidas,
      });

      const actual = await service.obtenerReporteNovedades(ID_ELECCION);

      expect(actual).toEqual({
        idEleccion: ID_ELECCION,
        totalProcesados: 105,
        totalImportados: 100,
        totalOmitidos: 5,
        novedades: novedadesPersistidas,
      });
    });

    it('debe rechazar (404) si la elección no tiene padrón', async () => {
      mockPadronRepository.obtenerPadronPorEleccion.mockResolvedValue(null);

      await expect(
        service.obtenerReporteNovedades(ID_ELECCION),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('listarVotantes', () => {
    it('debe devolver una página de hojas (índice + hash) con metadata', async () => {
      mockPadronRepository.existePadronParaEleccion.mockResolvedValue(true);
      mockPadronRepository.listarVotantesPaginado.mockResolvedValue([
        [
          {
            indiceHoja: 0,
            hashHoja: 'a'.repeat(64),
            generadoEn: new Date('2026-06-20T00:00:00Z'),
          },
        ],
        1000,
      ]);

      const actual = await service.listarVotantes(ID_ELECCION, 2, 50);

      expect(mockPadronRepository.listarVotantesPaginado).toHaveBeenCalledWith(
        ID_ELECCION,
        2,
        50,
      );
      expect(actual.total).toBe(1000);
      expect(actual.page).toBe(2);
      expect(actual.limit).toBe(50);
      expect(actual.items).toEqual([
        {
          indiceHoja: 0,
          hashHoja: 'a'.repeat(64),
          generadoEn: new Date('2026-06-20T00:00:00Z'),
        },
      ]);
    });

    it('debe rechazar (404) si la elección no tiene padrón', async () => {
      mockPadronRepository.existePadronParaEleccion.mockResolvedValue(false);

      await expect(service.listarVotantes(ID_ELECCION, 1, 50)).rejects.toThrow(
        NotFoundException,
      );
      expect(
        mockPadronRepository.listarVotantesPaginado,
      ).not.toHaveBeenCalled();
    });
  });

  describe('eliminarPadron', () => {
    it('debe eliminar el padrón de un comicio en BORRADOR', async () => {
      mockPadronRepository.existePadronParaEleccion.mockResolvedValue(true);

      await service.eliminarPadron(ID_ELECCION);

      expect(
        mockPadronRepository.eliminarPadronPorEleccion,
      ).toHaveBeenCalledWith(ID_ELECCION);
    });

    it('debe rechazar (404) si la elección no existe', async () => {
      mockPadronRepository.buscarEleccionPorId.mockResolvedValue(null);

      await expect(service.eliminarPadron(ID_ELECCION)).rejects.toThrow(
        NotFoundException,
      );
      expect(
        mockPadronRepository.eliminarPadronPorEleccion,
      ).not.toHaveBeenCalled();
    });

    it('debe rechazar (422) si la elección no está en estado BORRADOR', async () => {
      mockPadronRepository.buscarEleccionPorId.mockResolvedValue({
        idEleccion: ID_ELECCION,
        estado: EleccionEstado.ABIERTA,
      });

      await expect(service.eliminarPadron(ID_ELECCION)).rejects.toThrow(
        UnprocessableEntityException,
      );
      expect(
        mockPadronRepository.eliminarPadronPorEleccion,
      ).not.toHaveBeenCalled();
    });

    it('debe rechazar (404) si la elección no tiene padrón', async () => {
      mockPadronRepository.existePadronParaEleccion.mockResolvedValue(false);

      await expect(service.eliminarPadron(ID_ELECCION)).rejects.toThrow(
        NotFoundException,
      );
      expect(
        mockPadronRepository.eliminarPadronPorEleccion,
      ).not.toHaveBeenCalled();
    });
  });
});
