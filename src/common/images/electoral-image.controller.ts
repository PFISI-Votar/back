import {
  Controller,
  Get,
  Headers,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { ElectoralImageService } from '@/common/images/electoral-image.service';

const UN_ANIO_EN_SEGUNDOS = 31_536_000;

/**
 * VOTAR-466 — sirve los bytes de las imágenes electorales persistidas en
 * Postgres. Reemplaza el static serving de /uploads: ruta pública, sin
 * autenticación (igual que el disco antes), sin rate limit propio (el BUD
 * carga ~20 imágenes de golpe; el tier PUBLIC del rate limiter lo rompería).
 */
@ApiTags('imagenes')
@Controller('imagenes')
export class ElectoralImageController {
  constructor(private readonly electoralImageService: ElectoralImageService) {}

  @Get(':idImagen')
  @ApiOperation({
    summary: 'Servir los bytes de una imagen electoral (VOTAR-466)',
    description:
      'Ruta pública sin autenticación. El contenido es inmutable por UUID ' +
      '(cada carga genera un id nuevo), por lo que se cachea un año. ' +
      'Soporta revalidación con If-None-Match (ETag = SHA-256 del contenido).',
  })
  @ApiParam({
    name: 'idImagen',
    format: 'uuid',
    description: 'Identificador de la imagen (id_imagen en imagen_electoral)',
  })
  @ApiResponse({
    status: 200,
    description: 'Bytes de la imagen (WebP)',
    content: { 'image/webp': { schema: { type: 'string', format: 'binary' } } },
  })
  @ApiResponse({ status: 304, description: 'Not Modified — el ETag coincide' })
  @ApiResponse({
    status: 404,
    description: 'Imagen inexistente o identificador inválido',
  })
  async obtener(
    @Param(
      'idImagen',
      new ParseUUIDPipe({ errorHttpStatusCode: HttpStatus.NOT_FOUND }),
    )
    idImagen: string,
    @Headers('if-none-match') ifNoneMatch: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile | undefined> {
    const imagen = await this.electoralImageService.obtenerImagen(idImagen);
    if (!imagen) {
      throw new NotFoundException('Imagen no encontrada.');
    }

    const etag = `"${imagen.checksumSha256}"`;
    res.setHeader('ETag', etag);
    res.setHeader(
      'Cache-Control',
      `public, max-age=${UN_ANIO_EN_SEGUNDOS}, immutable`,
    );
    res.setHeader('Content-Type', imagen.mimeType);

    if (ifNoneMatch === etag) {
      res.status(HttpStatus.NOT_MODIFIED);
      return undefined;
    }

    res.setHeader('Content-Length', String(imagen.contenido.length));
    return new StreamableFile(imagen.contenido, { type: imagen.mimeType });
  }
}
