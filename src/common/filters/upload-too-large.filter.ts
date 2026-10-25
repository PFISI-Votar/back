import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
  PayloadTooLargeException,
} from '@nestjs/common';
import type { Response } from 'express';

/**
 * Multer responde 413 `File too large` antes de que el servicio vea el
 * archivo. El contrato de uploads (VOTAR-490) es 400: mismo rechazo que el
 * tope validado en el servicio, y nada persistido.
 */
@Catch(PayloadTooLargeException)
export class UploadTooLargeFilter implements ExceptionFilter {
  catch(exception: PayloadTooLargeException, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    if (exception.message !== 'File too large') {
      response.status(exception.getStatus()).json(exception.getResponse());
      return;
    }

    response.status(HttpStatus.BAD_REQUEST).json({
      statusCode: HttpStatus.BAD_REQUEST,
      message: 'El archivo supera el tamaño máximo permitido.',
      error: 'Bad Request',
    });
  }
}
