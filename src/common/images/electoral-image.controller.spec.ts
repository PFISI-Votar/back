import { HttpStatus, NotFoundException } from '@nestjs/common';
import { ElectoralImageController } from '@/common/images/electoral-image.controller';
import { ElectoralImageService } from '@/common/images/electoral-image.service';
import { ImagenElectoral } from '@/common/images/entities/imagen-electoral.entity';

describe('ElectoralImageController', () => {
  let controller: ElectoralImageController;
  let service: { obtenerImagen: jest.Mock };
  let res: {
    setHeader: jest.Mock;
    status: jest.Mock;
  };

  const idImagen = 'a1b2c3d4-e5f6-4789-a012-3456789abcde';

  const buildImagen = (
    overrides: Partial<ImagenElectoral> = {},
  ): ImagenElectoral => ({
    idImagen,
    tipo: 'candidato-foto',
    mimeType: 'image/webp',
    contenido: Buffer.from('bytes-de-imagen'),
    tamanoBytes: 15,
    checksumSha256: 'abc123',
    ancho: 400,
    alto: 400,
    fechaCreacion: new Date(),
    ...overrides,
  });

  beforeEach(() => {
    service = { obtenerImagen: jest.fn() };
    controller = new ElectoralImageController(
      service as unknown as ElectoralImageService,
    );
    res = {
      setHeader: jest.fn(),
      status: jest.fn(),
    };
  });

  it('devuelve 200 con Content-Type, ETag, Cache-Control immutable y Content-Length', async () => {
    const imagen = buildImagen();
    service.obtenerImagen.mockResolvedValue(imagen);

    const resultado = await controller.obtener(
      idImagen,
      undefined,
      res as never,
    );

    expect(service.obtenerImagen).toHaveBeenCalledWith(idImagen);
    expect(res.setHeader).toHaveBeenCalledWith('ETag', '"abc123"');
    expect(res.setHeader).toHaveBeenCalledWith(
      'Cache-Control',
      'public, max-age=31536000, immutable',
    );
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'image/webp');
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Length',
      String(imagen.contenido.length),
    );
    expect(resultado).toBeDefined();
  });

  it('devuelve 304 cuando If-None-Match coincide con el ETag', async () => {
    const imagen = buildImagen({ checksumSha256: 'coincide' });
    service.obtenerImagen.mockResolvedValue(imagen);

    const resultado = await controller.obtener(
      idImagen,
      '"coincide"',
      res as never,
    );

    expect(res.status).toHaveBeenCalledWith(HttpStatus.NOT_MODIFIED);
    expect(resultado).toBeUndefined();
  });

  it('lanza 404 cuando la imagen no existe', async () => {
    service.obtenerImagen.mockResolvedValue(null);

    await expect(
      controller.obtener(idImagen, undefined, res as never),
    ).rejects.toThrow(NotFoundException);
  });
});
