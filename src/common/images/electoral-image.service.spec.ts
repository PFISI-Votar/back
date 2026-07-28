import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { BadRequestException } from '@nestjs/common';
import sharp from 'sharp';
import { ElectoralImageService } from '@/common/images/electoral-image.service';

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

describe('ElectoralImageService', () => {
  let uploadRoot: string;
  let originalUploadsDir: string | undefined;
  let service: ElectoralImageService;

  beforeEach(async () => {
    originalUploadsDir = process.env.UPLOADS_DIR;
    uploadRoot = await fs.mkdtemp(join(tmpdir(), 'electoral-images-'));
    process.env.UPLOADS_DIR = uploadRoot;
    service = new ElectoralImageService();
  });

  afterEach(async () => {
    if (originalUploadsDir === undefined) {
      delete process.env.UPLOADS_DIR;
    } else {
      process.env.UPLOADS_DIR = originalUploadsDir;
    }
    await fs.rm(uploadRoot, { recursive: true, force: true });
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

  it('redimensiona fotografías de candidato a 400x400', async () => {
    const url = await service.saveImage(
      await makeImageFile(),
      'candidato-foto',
    );
    const metadata = await sharp(
      join(uploadRoot, url.replace('/uploads/', '')),
    ).metadata();

    expect(url).toMatch(/^\/uploads\/candidatos\/candidato-foto-.+\.jpg$/);
    expect(metadata.width).toBe(400);
    expect(metadata.height).toBe(400);
  });

  it('redimensiona logotipos de lista a 800x400', async () => {
    const url = await service.saveImage(await makeImageFile(), 'lista-logo');
    const metadata = await sharp(
      join(uploadRoot, url.replace('/uploads/', '')),
    ).metadata();

    expect(url).toMatch(/^\/uploads\/listas\/lista-logo-.+\.jpg$/);
    expect(metadata.width).toBe(800);
    expect(metadata.height).toBe(400);
  });

  it('elimina URLs gestionadas y tolera archivos inexistentes', async () => {
    const targetPath = join(uploadRoot, 'candidatos', 'foto.jpg');
    await fs.mkdir(join(uploadRoot, 'candidatos'), { recursive: true });
    await fs.writeFile(targetPath, 'demo');

    await service.deleteIfManagedUrl('/uploads/candidatos/foto.jpg');
    await expect(fs.access(targetPath)).rejects.toMatchObject({
      code: 'ENOENT',
    });

    await expect(
      service.deleteIfManagedUrl('/uploads/candidatos/foto.jpg'),
    ).resolves.toBeUndefined();
  });

  it('no elimina rutas con path traversal ni URLs no gestionadas', async () => {
    const outsidePath = join(uploadRoot, '..', 'outside-image.jpg');
    const unmanagedPath = join(uploadRoot, 'unmanaged-image.jpg');
    await fs.writeFile(outsidePath, 'outside');
    await fs.writeFile(unmanagedPath, 'unmanaged');

    await service.deleteIfManagedUrl('/uploads/../outside-image.jpg');
    await service.deleteIfManagedUrl('/static/unmanaged-image.jpg');

    await expect(fs.readFile(outsidePath, 'utf8')).resolves.toBe('outside');
    await expect(fs.readFile(unmanagedPath, 'utf8')).resolves.toBe('unmanaged');
  });
});
