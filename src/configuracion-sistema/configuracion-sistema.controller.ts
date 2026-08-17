import {
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { AdminAuth } from '@/auth/decorators/admin-auth.decorator';
import { ActualizarFormatoPersonalizadoActaAperturaDto } from '@/configuracion-sistema/dto/actualizar-formato-personalizado-acta-apertura.dto';
import { ActualizarFormatoPersonalizadoActaCierreDto } from '@/configuracion-sistema/dto/actualizar-formato-personalizado-acta-cierre.dto';
import { ActualizarPlantillaActaAperturaDto } from '@/configuracion-sistema/dto/actualizar-plantilla-acta-apertura.dto';
import { ActualizarPlantillaActaCierreDto } from '@/configuracion-sistema/dto/actualizar-plantilla-acta-cierre.dto';
import { ConfiguracionSistemaResponseDto } from '@/configuracion-sistema/dto/configuracion-sistema-response.dto';
import { ConfiguracionSistemaService } from '@/configuracion-sistema/configuracion-sistema.service';

@ApiTags('configuracion-sistema')
@AdminAuth()
@Controller('configuracion-sistema')
export class ConfiguracionSistemaController {
  constructor(
    private readonly configuracionSistemaService: ConfiguracionSistemaService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Obtener configuración global del sistema',
    description:
      'Incluye el logo institucional (VOTAR-374), válido para todos los comicios.',
  })
  @ApiResponse({
    status: 200,
    description: 'OK',
    type: ConfiguracionSistemaResponseDto,
  })
  async obtener(): Promise<ConfiguracionSistemaResponseDto> {
    return this.configuracionSistemaService.obtener();
  }

  @Patch('logo')
  @UseInterceptors(
    FileInterceptor('logo', {
      storage: memoryStorage(),
      limits: { fileSize: 2 * 1024 * 1024 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Subir o reemplazar el logo institucional',
    description:
      'Se embebe en reportes institucionales (ej. Acta de Apertura, VOTAR-374).',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: { logo: { type: 'string', format: 'binary' } },
      required: ['logo'],
    },
  })
  @ApiResponse({
    status: 200,
    description: 'OK',
    type: ConfiguracionSistemaResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Bad Request — imagen inválida' })
  async actualizarLogo(
    @UploadedFile() file: Express.Multer.File,
  ): Promise<ConfiguracionSistemaResponseDto> {
    return this.configuracionSistemaService.actualizarLogo(file);
  }

  @Delete('logo')
  @ApiOperation({ summary: 'Eliminar el logo institucional' })
  @ApiResponse({
    status: 200,
    description: 'OK',
    type: ConfiguracionSistemaResponseDto,
  })
  async eliminarLogo(): Promise<ConfiguracionSistemaResponseDto> {
    return this.configuracionSistemaService.eliminarLogo();
  }

  @Patch('acta-apertura-plantilla')
  @ApiOperation({
    summary: 'Actualizar la plantilla de contenido del Acta de Apertura',
    description:
      'Actualización parcial: solo se aplican los toggles presentes en el body (VOTAR-374).',
  })
  @ApiResponse({
    status: 200,
    description: 'OK',
    type: ConfiguracionSistemaResponseDto,
  })
  async actualizarPlantillaActaApertura(
    @Body() dto: ActualizarPlantillaActaAperturaDto,
  ): Promise<ConfiguracionSistemaResponseDto> {
    return this.configuracionSistemaService.actualizarPlantillaActaApertura(
      dto,
    );
  }

  @Patch('acta-apertura-formato')
  @ApiOperation({
    summary:
      'Actualizar el formato del Acta de Apertura (Simple/Personalizado)',
    description:
      'Actualización parcial: `modo` cambia entre SIMPLE/PERSONALIZADO y ' +
      '`plantillaTexto` es el cuerpo con variables `{{token}}` usado en ' +
      'modo PERSONALIZADO (VOTAR-374).',
  })
  @ApiResponse({
    status: 200,
    description: 'OK',
    type: ConfiguracionSistemaResponseDto,
  })
  async actualizarFormatoPersonalizadoActaApertura(
    @Body() dto: ActualizarFormatoPersonalizadoActaAperturaDto,
  ): Promise<ConfiguracionSistemaResponseDto> {
    return this.configuracionSistemaService.actualizarFormatoPersonalizadoActaApertura(
      dto,
    );
  }

  @Patch('acta-cierre-plantilla')
  @ApiOperation({
    summary: 'Actualizar la plantilla de contenido del Acta de Cierre',
    description:
      'Actualización parcial: solo se aplican los toggles presentes en el body.',
  })
  @ApiResponse({
    status: 200,
    description: 'OK',
    type: ConfiguracionSistemaResponseDto,
  })
  async actualizarPlantillaActaCierre(
    @Body() dto: ActualizarPlantillaActaCierreDto,
  ): Promise<ConfiguracionSistemaResponseDto> {
    return this.configuracionSistemaService.actualizarPlantillaActaCierre(dto);
  }

  @Patch('acta-cierre-formato')
  @ApiOperation({
    summary: 'Actualizar el formato del Acta de Cierre (Simple/Personalizado)',
    description:
      'Actualización parcial: `modo` cambia entre SIMPLE/PERSONALIZADO y ' +
      '`plantillaTexto` es el cuerpo con variables `{{token}}` usado en ' +
      'modo PERSONALIZADO.',
  })
  @ApiResponse({
    status: 200,
    description: 'OK',
    type: ConfiguracionSistemaResponseDto,
  })
  async actualizarFormatoPersonalizadoActaCierre(
    @Body() dto: ActualizarFormatoPersonalizadoActaCierreDto,
  ): Promise<ConfiguracionSistemaResponseDto> {
    return this.configuracionSistemaService.actualizarFormatoPersonalizadoActaCierre(
      dto,
    );
  }
}
