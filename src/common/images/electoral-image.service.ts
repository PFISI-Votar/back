import { promises as fs } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable } from '@nestjs/common';
import sharp from 'sharp';

export type ElectoralImageKind =
  | 'candidato-foto'
  | 'lista-logo'
  | 'logo-institucional';

const MAX_IMAGE_SIZE_BYTES = 2 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png']);
const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png']);

const IMAGE_CONFIG: Record<
  ElectoralImageKind,
  {
    directory: string;
    width: number;
    height: number;
    label: string;
    fit: 'cover' | 'contain';
  }
> = {
  'candidato-foto': {
    directory: 'candidatos',
    width: 400,
    height: 400,
    label: 'fotografía de candidato',
    fit: 'cover',
  },
  'lista-logo': {
    directory: 'listas',
    width: 800,
    height: 400,
    label: 'logotipo de lista',
    fit: 'cover',
  },
  'logo-institucional': {
    directory: 'sistema',
    width: 600,
    height: 600,
    label: 'logotipo institucional',
    // 'contain' evita recortar logos con proporciones no cuadradas
    // (se embeben en el encabezado de reportes institucionales, ej. Acta
    // de Apertura VOTAR-374).
    fit: 'contain',
  },
};

@Injectable()
export class ElectoralImageService {
  private readonly uploadRoot = resolve(process.env.UPLOADS_DIR ?? 'uploads');
  private readonly publicRoot = '/uploads';

  async saveImage(
    file: Express.Multer.File | undefined,
    kind: ElectoralImageKind,
  ): Promise<string> {
    this.validateFile(file);

    const config = IMAGE_CONFIG[kind];
    const filename = `${kind}-${Date.now()}-${randomUUID()}.jpg`;
    const directory = join(this.uploadRoot, config.directory);
    const targetPath = join(directory, filename);

    await fs.mkdir(directory, { recursive: true });
    await sharp(file.buffer, { failOn: 'error' })
      .rotate()
      .resize(config.width, config.height, {
        fit: config.fit,
        position: 'center',
      })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: 88, mozjpeg: true })
      .toFile(targetPath);

    return `${this.publicRoot}/${config.directory}/${filename}`;
  }

  async deleteIfManagedUrl(url: string | null | undefined): Promise<void> {
    if (!url) {
      return;
    }

    const pathname = this.getPathname(url);
    if (!pathname.startsWith(`${this.publicRoot}/`)) {
      return;
    }

    const relativePath = pathname.slice(this.publicRoot.length + 1);
    const targetPath = resolve(this.uploadRoot, relativePath);
    const rootWithSeparator = `${this.uploadRoot}${sep}`;

    if (
      targetPath !== this.uploadRoot &&
      !targetPath.startsWith(rootWithSeparator)
    ) {
      return;
    }

    try {
      await fs.unlink(targetPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
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
