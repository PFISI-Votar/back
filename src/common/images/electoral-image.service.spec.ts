import { createHash } from 'node:crypto';
import { BadRequestException } from '@nestjs/common';
import sharp from 'sharp';
import { ElectoralImageService } from '@/common/images/electoral-image.service';
import { ImagenElectoral } from '@/common/images/entities/imagen-electoral.entity';

const makeImageFile = async (
  options: Partial<Express.Multer.File> = {},
): Promise<Express.Multer.File> => {
  const buffer =
    options.buffer ??
    (await sharp({
      create: {
        width: 1200,
        height: 600,
        channels: 3,
        background: '#2563eb',
      },
    })
      .png()
      .toBuffer());

  return {
    fieldname: 'imagen',
    originalname: 'imagen.png',
    encoding: '7bit',
    mimetype: 'image/png',
    size: buffer.length,
    buffer,
    destination: '',
    filename: '',
    path: '',
    stream: undefined as never,
    ...options,
  };
};

/** Genera un PNG grande y con ruido, para forzar el presupuesto de tamaño. */
const makeNoisyImageFile = async (
  width: number,
  height: number,
): Promise<Express.Multer.File> => {
  const buffer = await sharp({
    create: {
      width,
      height,
      channels: 3,
      background: '#808080',
      noise: { type: 'gaussian', mean: 128, sigma: 60 },
    },
  })
    .png()
    .toBuffer();

  return makeImageFile({ buffer, size: buffer.length });
};

type PartialImagen = Partial<ImagenElectoral>;

describe('ElectoralImageService', () => {
  let mockRepository: {
    create: jest.Mock<PartialImagen, [PartialImagen]>;
    save: jest.Mock<Promise<ImagenElectoral>, [PartialImagen]>;
    delete: jest.Mock<Promise<void>, [{ idImagen: string }]>;
    createQueryBuilder: jest.Mock;
  };
  let service: ElectoralImageService;

  beforeEach(() => {
    mockRepository = {
      create: jest.fn((entity: PartialImagen) => entity),
      save: jest.fn((entity: PartialImagen) =>
        Promise.resolve({
          idImagen: 'a1b2c3d4-e5f6-4789-a012-3456789abcde',
          ...entity,
        } as ImagenElectoral),
      ),
      delete: jest.fn((_idImagen: { idImagen: string }) => Promise.resolve()),
      createQueryBuilder: jest.fn(),
    };
    service = new ElectoralImageService(
      mockRepository as unknown as import('typeorm').Repository<ImagenElectoral>,
    );
  });

  it('rechaza archivos PDF/GIF y archivos mayores a 2MB', async () => {
    await expect(
      service.saveImage(
        await makeImageFile({
          originalname: 'documento.pdf',
          mimetype: 'application/pdf',
        }),
        'candidato-foto',
      ),
    ).rejects.toThrow(BadRequestException);

    await expect(
      service.saveImage(
        await makeImageFile({
          size: 2 * 1024 * 1024 + 1,
        }),
        'lista-logo',
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('redimensiona fotografías de candidato a 400x400 y persiste en WebP', async () => {
    const url = await service.saveImage(
      await makeImageFile(),
      'candidato-foto',
    );

    expect(url).toMatch(/^\/imagenes\/[0-9a-f-]{36}$/);
    expect(mockRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        tipo: 'candidato-foto',
        mimeType: 'image/webp',
        ancho: 400,
        alto: 400,
      }),
    );

    const contenido = mockRepository.save.mock.calls[0][0].contenido as Buffer;
    // Magic number RIFF....WEBP
    expect(contenido.subarray(0, 4).toString()).toBe('RIFF');
    expect(contenido.subarray(8, 12).toString()).toBe('WEBP');
  });

  it('redimensiona logotipos de lista a 800x400', async () => {
    await service.saveImage(await makeImageFile(), 'lista-logo');

    expect(mockRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        tipo: 'lista-logo',
        mimeType: 'image/webp',
        ancho: 800,
        alto: 400,
      }),
    );
  });

  it('convierte PNG con transparencia sobre fondo blanco', async () => {
    const buffer = await sharp({
      create: {
        width: 400,
        height: 400,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .png()
      .toBuffer();

    await service.saveImage(
      await makeImageFile({ buffer, size: buffer.length }),
      'logo-institucional',
    );

    const contenido = mockRepository.save.mock.calls[0][0].contenido as Buffer;
    const metadata = await sharp(contenido).stats();
    // El fondo del canvas 600x600 'contain' queda blanco: dominante en el
    // histograma de cada canal RGB.
    expect(metadata.channels[0].mean).toBeGreaterThan(200);
  });

  it('calcula el checksum SHA-256 del contenido persistido', async () => {
    await service.saveImage(await makeImageFile(), 'candidato-foto');

    const saved = mockRepository.save.mock.calls[0][0];
    const expectedChecksum = createHash('sha256')
      .update(saved.contenido as Buffer)
      .digest('hex');
    expect(saved.checksumSha256).toBe(expectedChecksum);
  });

  it('respeta el presupuesto de tamaño de salida por tipo', async () => {
    // 700x700 de ruido gaussiano: a calidad 80 el WebP resultante (400x400)
    // supera el presupuesto de candidato-foto (60 KB), forzando el loop de
    // reintentos a bajar de calidad hasta entrar.
    const url = await service.saveImage(
      await makeNoisyImageFile(700, 700),
      'candidato-foto',
    );

    expect(url).toMatch(/^\/imagenes\/[0-9a-f-]{36}$/);
    const saved = mockRepository.save.mock.calls[0][0];
    // 60 KB — presupuesto de candidato-foto (ver IMAGE_CONFIG)
    expect(saved.tamanoBytes).toBeLessThanOrEqual(60 * 1024);
  }, 15_000);

  it('elimina la fila cuando la URL es gestionada', async () => {
    const idImagen = 'a1b2c3d4-e5f6-4789-a012-3456789abcde';
    await service.deleteIfManagedUrl(`/imagenes/${idImagen}`);

    expect(mockRepository.delete).toHaveBeenCalledWith({ idImagen });
  });

  it('no elimina URLs legacy /uploads, UUIDs malformados ni URLs no gestionadas', async () => {
    await service.deleteIfManagedUrl('/uploads/candidatos/foto.jpg');
    await service.deleteIfManagedUrl('/imagenes/../secreto');
    await service.deleteIfManagedUrl('/imagenes/no-es-un-uuid');
    await service.deleteIfManagedUrl('/static/x.jpg');
    await service.deleteIfManagedUrl(null);

    expect(mockRepository.delete).not.toHaveBeenCalled();
  });

  it('obtenerImagen pide el contenido con addSelect', async () => {
    const addSelect = jest.fn().mockReturnThis();
    const where = jest.fn().mockReturnThis();
    const getOne = jest.fn().mockResolvedValue({
      idImagen: 'a1b2c3d4-e5f6-4789-a012-3456789abcde',
      contenido: Buffer.from('demo'),
    });
    mockRepository.createQueryBuilder.mockReturnValue({
      addSelect,
      where,
      getOne,
    });

    const idImagen = 'a1b2c3d4-e5f6-4789-a012-3456789abcde';
    const resultado = await service.obtenerImagen(idImagen);

    expect(mockRepository.createQueryBuilder).toHaveBeenCalledWith('imagen');
    expect(addSelect).toHaveBeenCalledWith('imagen.contenido');
    expect(where).toHaveBeenCalledWith('imagen.idImagen = :idImagen', {
      idImagen,
    });
    expect(resultado?.idImagen).toBe(idImagen);
  });
});
