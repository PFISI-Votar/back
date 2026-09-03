import { Injectable } from '@nestjs/common';
import { AuditLoggerService } from '@/audit/audit-logger.service';
import { ClavePublicaValidadorResponseDto } from '@/entidad-firmas/dto/clave-publica-validador-response.dto';
import { FirmaValidacionResponseDto } from '@/entidad-firmas/dto/firma-validacion-response.dto';
import { SolicitarFirmaValidacionDto } from '@/entidad-firmas/dto/solicitar-firma-validacion.dto';
import { CredencialValidacionService } from '@/entidad-firmas/services/credencial-validacion.service';
import {
  FIRMA_VALIDACION_ALGORITMO,
  FirmaInstitucionalService,
} from '@/entidad-firmas/services/firma-institucional.service';

/**
 * VOTAR-377 — orquesta la FASE 2 (anónima): canjea el secreto de la credencial por
 * la firma institucional EIP-712. Nunca recibe identidad del votante.
 */
@Injectable()
export class EntidadFirmasService {
  constructor(
    private readonly credencialService: CredencialValidacionService,
    private readonly firmaService: FirmaInstitucionalService,
    private readonly auditLogger: AuditLoggerService,
  ) {}

  async certificarSufragio(
    idEleccion: number,
    dto: SolicitarFirmaValidacionDto,
  ): Promise<FirmaValidacionResponseDto> {
    // 1. Uso único de la credencial anónima (UPDATE atómico condicional).
    await this.credencialService.consumir(idEleccion, dto.secreto);

    // 2. Firma institucional sobre la totalidad del payload (AC-5).
    const { firmaValidacion, direccionValidador } =
      await this.firmaService.firmarValidacion(idEleccion, {
        electionId: BigInt(idEleccion),
        nullifier: dto.nullifier,
        selectionHash: dto.selectionHash,
        candidateId: BigInt(dto.candidateId),
        timestamp: BigInt(dto.timestamp),
        expectedSigner: dto.expectedSigner,
      });

    // 3. Rastro de auditoría anónimo (UAT-04): sin nullifier, selectionHash ni commit.
    await this.auditLogger.logFirmaValidacionEmitida({
      idEleccion,
      direccionValidador,
      algoritmo: FIRMA_VALIDACION_ALGORITMO,
    });

    return {
      firmaValidacion,
      direccionValidador,
      algoritmo: FIRMA_VALIDACION_ALGORITMO,
    };
  }

  obtenerClavePublica(): ClavePublicaValidadorResponseDto {
    return {
      algoritmo: FIRMA_VALIDACION_ALGORITMO,
      clavePublica: this.firmaService.obtenerDireccionValidador(),
    };
  }
}
