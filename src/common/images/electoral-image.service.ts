import { createHash } from 'node:crypto';
import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import sharp from 'sharp';
import { ImagenElectoral } from '@/common/images/entities/imagen-electoral.entity';

export type ElectoralImageKind =
  | 'candidato-foto'
  | 'lista-logo'
  | 'logo-institucional';

/**
 * VOTAR-466 — las imágenes se sirven desde Postgres en esta ruta pública,
 * reemplazando el static serving de /uploads. El identificador es el UUID
 * de la fila en `imagen_electoral`.
 */
export const PUBLIC_IMAGE_ROOT = '/imagenes';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MAX_IMAGE_SIZE_BYTES = 2 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png']);
const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png']);

/**
 * Calidades de WebP a intentar, de mayor a menor, hasta que el resultado
 * entre en el presupuesto de tamaño del tipo (VOTAR-466). Si ninguna entra,
 * se conserva la última pasada (la de menor peso): nunca se rechaza una
 * imagen que ya pasó la validación de entrada por su tamaño de salida.
 */
const WEBP_QUALITY_STEPS = [80, 70, 60, 50] as const;

interface ImageKindConfig {
  width: number;
  height: number;
  label: string;
  fit: 'cover' | 'contain';
  /** Presupuesto de tamaño de salida en bytes, tras optimizar a WebP. */
  maxOutputBytes: number;
}

export const IMAGE_CONFIG: Record<ElectoralImageKind, ImageKindConfig> = {
  'candidato-foto': {
    width: 400,
    height: 400,
    label: 'fotografía de candidato',
    fit: 'cover',
    maxOutputBytes: 60 * 1024,
  },
  'lista-logo': {
    width: 800,
    height: 400,
    label: 'logotipo de lista',
    fit: 'cover',
    maxOutputBytes: 100 * 1024,
  },
  'logo-institucional': {
    width: 600,
    height: 600,
    label: 'logotipo institucional',
    // 'contain' evita recortar logos con proporciones no cuadradas
    // (se embeben en el encabezado de reportes institucionales, ej. Acta
    // de Apertura VOTAR-374).
    fit: 'contain',
    maxOutputBytes: 100 * 1024,
  },
};

/**
 * Normaliza (recorte/relleno según el tipo) y optimiza a WebP con
 * presupuesto de tamaño (VOTAR-466). Pura y sin dependencia de Nest DI para
 * que también la usen los seeds (`election-seed-utils.ts`), que corren
 * fuera del contenedor de inyección y deben producir imágenes idénticas a
 * las que sube un usuario real.
 */
export const optimizarImagenElectoral = async (
  buffer: Buffer,
  config: ImageKindConfig,
): Promise<{ data: Buffer; info: sharp.OutputInfo }> => {
    const base = sharp(buffer, { failOn: 'error' })
    .rotate() // aplica la orientación EXIF y descarta el resto del EXIF
    .resize(config.width, config.height, {
      fit: config.fit,
      position: 'center',
      // VOTAR-457: sin esto, el espacio sobrante que deja `fit: 'contain'`
      // (logos no cuadrados) se rellena de negro por default en Sharp.
      // `flatten` de abajo no alcanza porque solo aplana transparencia
      // existente, no el padding que agrega resize().
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    })
    .flatten({ background: '#ffffff' });

  let resultado: { data: Buffer; info: sharp.OutputInfo } | undefined;
  for (const quality of WEBP_QUALITY_STEPS) {
    // .clone() es obligatorio: un pipeline de sharp no se puede reejecutar.
    resultado = await base
      .clone()
      .webp({ quality, effort: 5 })
      .toBuffer({ resolveWithObject: true });

    if (resultado.data.length <= config.maxOutputBytes) {
      break;
    }
  }

  return resultado as { data: Buffer; info: sharp.OutputInfo };
};

@Injectable()
export class ElectoralImageService {
  constructor(
    @InjectRepository(ImagenElectoral)
    private readonly repository: Repository<ImagenElectoral>,
  ) {}

  async saveImage(
    file: Express.Multer.File | undefined,
    kind: ElectoralImageKind,
  ): Promise<string> {
    this.validateFile(file);

    const config = IMAGE_CONFIG[kind];
    const { data, info } = await optimizarImagenElectoral(file.buffer, config);

    const guardada = await this.repository.save(
      this.repository.create({
        tipo: kind,
        mimeType: 'image/webp',
        contenido: data,
        tamanoBytes: data.length,
        checksumSha256: createHash('sha256').update(data).digest('hex'),
        ancho: info.width,
        alto: info.height,
      }),
    );

    return `${PUBLIC_IMAGE_ROOT}/${guardada.idImagen}`;
  }

  /**
   * Los bytes viven en una columna `select: false`; hay que pedirlos
   * explícito. Usado por el controlador para servir la imagen.
   */
  async obtenerImagen(idImagen: string): Promise<ImagenElectoral | null> {
    return this.repository
      .createQueryBuilder('imagen')
      .addSelect('imagen.contenido')
      .where('imagen.idImagen = :idImagen', { idImagen })
      .getOne();
  }

  async deleteIfManagedUrl(url: string | null | undefined): Promise<void> {
    const idImagen = this.extractImageId(url);
    if (!idImagen) {
      return;
    }

    await this.repository.delete({ idImagen });
  }

  private validateFile(
    file: Express.Multer.File | undefined,
  ): asserts file is Express.Multer.File {
    if (!file) {
      throw new BadRequestException('Debe adjuntar una imagen PNG o JPG/JPEG.');
    }

    const extension = this.getExtension(file.originalname);
    if (
      !ALLOWED_MIME_TYPES.has(file.mimetype) ||
      !ALLOWED_EXTENSIONS.has(extension)
    ) {
      throw new BadRequestException(
        'La imagen debe estar en formato PNG o JPG/JPEG.',
      );
    }

    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      throw new BadRequestException('La imagen no puede superar los 2MB.');
    }
  }

  private getExtension(filename: string): string {
    const normalized = filename.toLowerCase();
    const index = normalized.lastIndexOf('.');
    return index === -1 ? '' : normalized.slice(index);
  }

  /**
   * Reemplaza el guard de path traversal del backend en disco: cualquier
   * pathname que no sea exactamente `/imagenes/<uuid>` se ignora (incluye
   * URLs legacy `/uploads/...` que puedan sobrevivir en un dump anterior a
   * VOTAR-466).
   */
  private extractImageId(url: string | null | undefined): string | null {
    if (!url) {
      return null;
    }

    const pathname = this.getPathname(url);
    if (!pathname.startsWith(`${PUBLIC_IMAGE_ROOT}/`)) {
      return null;
    }

    const candidate = pathname.slice(PUBLIC_IMAGE_ROOT.length + 1);
    return UUID_PATTERN.test(candidate) ? candidate : null;
  }

  private getPathname(url: string): string {
    if (url.startsWith('/')) {
      return url;
    }
    try {
      return new URL(url).pathname;
    } catch {
      return `/${url.replace(/^\/+/, '')}`.replace(/\\/g, '/');
    }
  }
}
