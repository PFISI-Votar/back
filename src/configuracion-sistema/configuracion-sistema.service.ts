import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ElectoralImageService } from '@/common/images/electoral-image.service';
import { ActualizarFormatoPersonalizadoActaAperturaDto } from '@/configuracion-sistema/dto/actualizar-formato-personalizado-acta-apertura.dto';
import { ActualizarFormatoPersonalizadoActaCierreDto } from '@/configuracion-sistema/dto/actualizar-formato-personalizado-acta-cierre.dto';
import { ActualizarPlantillaActaAperturaDto } from '@/configuracion-sistema/dto/actualizar-plantilla-acta-apertura.dto';
import { ActualizarPlantillaActaCierreDto } from '@/configuracion-sistema/dto/actualizar-plantilla-acta-cierre.dto';
import { ConfiguracionSistemaResponseDto } from '@/configuracion-sistema/dto/configuracion-sistema-response.dto';
import {
  ACTA_APERTURA_MODO_DEFAULT,
  ACTA_APERTURA_PLANTILLA_DEFAULT,
  ACTA_CIERRE_PLANTILLA_DEFAULT,
  ConfiguracionSistema,
} from '@/configuracion-sistema/entities/configuracion-sistema.entity';

const CONFIGURACION_ID = 1;

/**
 * Fila singleton (id=1) sembrada por migración. Reutiliza el
 * ElectoralImageService existente (fotos de candidato, logos de lista)
 * para el logo institucional (VOTAR-374).
 */
@Injectable()
export class ConfiguracionSistemaService {
  constructor(
    @InjectRepository(ConfiguracionSistema)
    private readonly repository: Repository<ConfiguracionSistema>,
    private readonly electoralImageService: ElectoralImageService,
  ) {}

  async obtener(): Promise<ConfiguracionSistemaResponseDto> {
    const configuracion = await this.getOrCreate();
    return this.toResponse(configuracion);
  }

  async actualizarLogo(
    file: Express.Multer.File,
  ): Promise<ConfiguracionSistemaResponseDto> {
    const configuracion = await this.getOrCreate();
    const previousLogoUrl = configuracion.logoUrl;

    const nextLogoUrl = await this.electoralImageService.saveImage(
      file,
      'logo-institucional',
    );

    configuracion.logoUrl = nextLogoUrl;
    const saved = await this.repository.save(configuracion);
    await this.electoralImageService.deleteIfManagedUrl(previousLogoUrl);

    return this.toResponse(saved);
  }

  async eliminarLogo(): Promise<ConfiguracionSistemaResponseDto> {
    const configuracion = await this.getOrCreate();
    const previousLogoUrl = configuracion.logoUrl;

    configuracion.logoUrl = null;
    const saved = await this.repository.save(configuracion);
    await this.electoralImageService.deleteIfManagedUrl(previousLogoUrl);

    return this.toResponse(saved);
  }

  async actualizarPlantillaActaApertura(
    dto: ActualizarPlantillaActaAperturaDto,
  ): Promise<ConfiguracionSistemaResponseDto> {
    const configuracion = await this.getOrCreate();
    configuracion.actaAperturaPlantilla = {
      ...configuracion.actaAperturaPlantilla,
      ...dto,
    };
    const saved = await this.repository.save(configuracion);
    return this.toResponse(saved);
  }

  async actualizarFormatoPersonalizadoActaApertura(
    dto: ActualizarFormatoPersonalizadoActaAperturaDto,
  ): Promise<ConfiguracionSistemaResponseDto> {
    const configuracion = await this.getOrCreate();
    if (dto.modo !== undefined) {
      configuracion.actaAperturaModo = dto.modo;
    }
    if (dto.plantillaTexto !== undefined) {
      configuracion.actaAperturaPlantillaTexto = dto.plantillaTexto;
    }
    const saved = await this.repository.save(configuracion);
    return this.toResponse(saved);
  }

  async actualizarPlantillaActaCierre(
    dto: ActualizarPlantillaActaCierreDto,
  ): Promise<ConfiguracionSistemaResponseDto> {
    const configuracion = await this.getOrCreate();
    configuracion.actaCierrePlantilla = {
      ...configuracion.actaCierrePlantilla,
      ...dto,
    };
    const saved = await this.repository.save(configuracion);
    return this.toResponse(saved);
  }

  async actualizarFormatoPersonalizadoActaCierre(
    dto: ActualizarFormatoPersonalizadoActaCierreDto,
  ): Promise<ConfiguracionSistemaResponseDto> {
    const configuracion = await this.getOrCreate();
    if (dto.modo !== undefined) {
      configuracion.actaCierreModo = dto.modo;
    }
    if (dto.plantillaTexto !== undefined) {
      configuracion.actaCierrePlantillaTexto = dto.plantillaTexto;
    }
    const saved = await this.repository.save(configuracion);
    return this.toResponse(saved);
  }

  private async getOrCreate(): Promise<ConfiguracionSistema> {
    const existente = await this.repository.findOne({
      where: { id: CONFIGURACION_ID },
    });
    if (existente) {
      return existente;
    }
    return this.repository.save(
      this.repository.create({
        id: CONFIGURACION_ID,
        logoUrl: null,
        actaAperturaPlantilla: ACTA_APERTURA_PLANTILLA_DEFAULT,
        actaAperturaModo: ACTA_APERTURA_MODO_DEFAULT,
        actaAperturaPlantillaTexto: null,
        actaCierrePlantilla: ACTA_CIERRE_PLANTILLA_DEFAULT,
        actaCierreModo: ACTA_APERTURA_MODO_DEFAULT,
        actaCierrePlantillaTexto: null,
      }),
    );
  }

  private toResponse(
    configuracion: ConfiguracionSistema,
  ): ConfiguracionSistemaResponseDto {
    return {
      logoUrl: configuracion.logoUrl,
      actaAperturaPlantilla: configuracion.actaAperturaPlantilla,
      actaAperturaModo: configuracion.actaAperturaModo,
      actaAperturaPlantillaTexto: configuracion.actaAperturaPlantillaTexto,
      actaCierrePlantilla: configuracion.actaCierrePlantilla,
      actaCierreModo: configuracion.actaCierreModo,
      actaCierrePlantillaTexto: configuracion.actaCierrePlantillaTexto,
      fechaActualizacion: configuracion.fechaActualizacion.toISOString(),
    };
  }
}
