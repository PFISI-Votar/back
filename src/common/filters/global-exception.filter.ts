import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

/**
 * VOTAR-491 — Principio de falla segura (Ley 25.326): ningún error de la API
 * puede filtrar stack traces, secretos, DNI, emails ni detalles internos
 * (ej. mensajes crudos de RPC/driver de BD) al cliente. Toda respuesta con
 * status >= 500 se normaliza a un mensaje genérico, sin importar si el
 * origen es una excepción no controlada o una HttpException con detalle
 * interno embebido (ver ${message} en blockchain.service.ts). El detalle
 * completo (stack, mensaje original) sólo se registra en logs internos.
 *
 * Las HttpException < 500 (validaciones, 401/403/404/409/422, etc.) son
 * mensajes de negocio ya curados por el propio código de dominio: se
 * reenvían tal cual, preservando forma completa del body (incluye campos
 * adicionales como `errors`/`violations` de excepciones de validación
 * estructuradas).
 */
const GENERIC_ERROR_MESSAGE =
  'Ocurrió un error al procesar la solicitud. Intente nuevamente más tarde.';

/** HttpStatus.INTERNAL_SERVER_ERROR como number plano (evita comparar un
 * `number` en runtime contra un miembro de enum, señalado por
 * no-unsafe-enum-comparison). */
const MIN_SERVER_ERROR_STATUS: number = HttpStatus.INTERNAL_SERVER_ERROR;

interface ClientErrorBody {
  statusCode: number;
  message: string | string[];
  error?: string;
  timestamp: string;
  path: string;
  [key: string]: unknown;
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status = this.resolveStatus(exception);
    this.logInternamente(exception, request, status);

    const body: ClientErrorBody =
      status >= MIN_SERVER_ERROR_STATUS
        ? this.buildGenericBody(status, request)
        : this.buildClientSafeBody(exception as HttpException, status, request);

    response.status(status).json(body);
  }

  private resolveStatus(exception: unknown): number {
    if (exception instanceof HttpException) {
      return exception.getStatus();
    }
    return HttpStatus.INTERNAL_SERVER_ERROR;
  }

  private buildGenericBody(status: number, request: Request): ClientErrorBody {
    return {
      statusCode: status,
      message: GENERIC_ERROR_MESSAGE,
      error: 'Internal Server Error',
      timestamp: new Date().toISOString(),
      path: this.resolvePath(request),
    };
  }

  private buildClientSafeBody(
    exception: HttpException,
    status: number,
    request: Request,
  ): ClientErrorBody {
    const timestamp = new Date().toISOString();
    const path = this.resolvePath(request);
    const raw = exception.getResponse();

    if (typeof raw === 'string') {
      return { statusCode: status, message: raw, timestamp, path };
    }

    if (raw && typeof raw === 'object') {
      // El body curado por la excepción de dominio manda; timestamp/path
      // son metadatos propios del filtro y nunca deben ser pisados por él.
      return {
        statusCode: status,
        ...(raw as Record<string, unknown>),
        timestamp,
        path,
      } as ClientErrorBody;
    }

    return { statusCode: status, message: exception.message, timestamp, path };
  }

  private resolvePath(request: Request): string {
    return request.originalUrl ?? request.url ?? '';
  }

  /**
   * Registra el detalle completo (incluye stack trace y mensaje original,
   * potencialmente con datos internos crudos de RPC/driver) exclusivamente
   * en el log del proceso. Nunca llega al cliente.
   */
  private logInternamente(
    exception: unknown,
    request: Request,
    status: number,
  ): void {
    const contexto = `${request.method} ${this.resolvePath(request)}`;
    if (exception instanceof Error) {
      if (status >= MIN_SERVER_ERROR_STATUS) {
        this.logger.error(
          `[${status}] ${contexto} — ${exception.message}`,
          exception.stack,
        );
      } else {
        this.logger.warn(`[${status}] ${contexto} — ${exception.message}`);
      }
      return;
    }
    this.logger.error(
      `[${status}] ${contexto} — excepción no estándar: ${JSON.stringify(exception)}`,
    );
  }
}
