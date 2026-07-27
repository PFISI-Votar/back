import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLoggerService } from '@/audit/audit-logger.service';
import {
  MAX_INTERVALO_SEGUNDOS,
  MAX_SUFRAGIOS_POR_VOTANTE,
  MIN_SUFRAGIOS_CON_REVOTO,
} from '@/eleccion/configuracion-comicio/constants/revoto.constants';
import {
  ConfiguracionRevotoResponseDto,
  GuardarConfiguracionRevotoDto,
} from '@/eleccion/configuracion-comicio/dto/configuracion-revoto.dto';
import { ConfiguracionComicio } from '@/eleccion/configuracion-comicio/entities/configuracion-comicio.entity';
import { MetodoAutenticacion } from '@/eleccion/configuracion-comicio/enums/metodo-autenticacion.enum';
import { PoliticaRevoto } from '@/eleccion/configuracion-comicio/enums/politica-revoto.enum';
import { ConfiguracionRevotoAuditContext } from '@/eleccion/configuracion-comicio/interfaces/configuracion-revoto-audit-context.interface';
import { Eleccion } from '@/eleccion/entities/eleccion.entity';
import { EleccionEstado } from '@/eleccion/enums/eleccion-estado.enum';
import { CrearEleccionValidationException } from '@/eleccion/exceptions/crear-eleccion-validation.exception';
import { assertEleccionEditable } from '@/eleccion/utils/eleccion-editable.util';

@Injectable()
export class ConfiguracionComicioService {
  constructor(
    @InjectRepository(ConfiguracionComicio)
    private readonly configRepository: Repository<ConfiguracionComicio>,
    @InjectRepository(Eleccion)
    private readonly eleccionRepository: Repository<Eleccion>,
    private readonly auditLoggerService: AuditLoggerService,
  ) {}

  assertMetodosAutenticacionValidos(metodos: MetodoAutenticacion[]): void {
    if (!metodos || metodos.length === 0) {
      throw new CrearEleccionValidationException([
        {
          field: 'metodosAutenticacion',
          message:
            'Debe definir al menos un método de inicio de sesión activo.',
        },
      ]);
    }
  }

  async crearConfiguracionInicial(
    idEleccion: number,
    metodosAutenticacion: MetodoAutenticacion[],
  ): Promise<ConfiguracionComicio> {
    this.assertMetodosAutenticacionValidos(metodosAutenticacion);
    const config = this.configRepository.create({
      idEleccion,
      metodosAutenticacion,
      permitirVotoEnBlanco: false,
      permitirVotoMultiple: false,
      maxVotosPorVotante: 1,
      minIntervaloSegundos: 0,
      mostrarResultadosTiempoReal: false,
      politicaRevoto: PoliticaRevoto.DISABLED,
    });
    return this.configRepository.save(config);
  }

  async obtenerConfiguracionRevoto(
    idEleccion: number,
  ): Promise<ConfiguracionRevotoResponseDto> {
    const eleccion = await this.assertEleccionExists(idEleccion);
    const config = await this.findOrCreateConfig(idEleccion);
    return this.toRevotoResponse(config, eleccion.estado);
  }

  async guardarConfiguracionRevoto(
    idEleccion: number,
    dto: GuardarConfiguracionRevotoDto,
    auditContext: ConfiguracionRevotoAuditContext,
  ): Promise<ConfiguracionRevotoResponseDto> {
    const eleccion = await this.assertEleccionExists(idEleccion);
    assertEleccionEditable(eleccion);
    this.validarDtoRevoto(dto);
    const config = await this.findOrCreateConfig(idEleccion);
    const antes = {
      permitirVotoMultiple: config.permitirVotoMultiple,
      maxVotosPorVotante: config.maxVotosPorVotante,
      minIntervaloSegundos: config.minIntervaloSegundos,
      politicaRevoto: config.politicaRevoto,
    };
    this.aplicarPoliticaRevoto(config, dto);
    const guardada = await this.configRepository.save(config);
    const despues = {
      permitirVotoMultiple: guardada.permitirVotoMultiple,
      maxVotosPorVotante: guardada.maxVotosPorVotante,
      minIntervaloSegundos: guardada.minIntervaloSegundos,
      politicaRevoto: guardada.politicaRevoto,
    };
    if (
      antes.permitirVotoMultiple !== despues.permitirVotoMultiple ||
      antes.maxVotosPorVotante !== despues.maxVotosPorVotante ||
      antes.minIntervaloSegundos !== despues.minIntervaloSegundos ||
      antes.politicaRevoto !== despues.politicaRevoto
    ) {
      await this.auditLoggerService.logConfigModificada({
        idEleccion,
        actorId: auditContext.actorId,
        ipOrigen: auditContext.ipOrigen,
        cambios: { revoto: { antes, despues } },
      });
    }
    return this.toRevotoResponse(guardada, eleccion.estado);
  }

  private validarDtoRevoto(dto: GuardarConfiguracionRevotoDto): void {
    if (
      dto.maxVotosPorVotante !== undefined &&
      (dto.maxVotosPorVotante < 1 ||
        dto.maxVotosPorVotante > MAX_SUFRAGIOS_POR_VOTANTE)
    ) {
      throw new UnprocessableEntityException({
        message: 'Configuración de re-voto inválida.',
        errors: [
          {
            field: 'maxVotosPorVotante',
            message: `Debe estar entre 1 y ${MAX_SUFRAGIOS_POR_VOTANTE}.`,
          },
        ],
      });
    }
    if (
      !dto.permitirVotoMultiple &&
      dto.maxVotosPorVotante !== undefined &&
      dto.maxVotosPorVotante > 1
    ) {
      throw new UnprocessableEntityException(
        'No se puede establecer maxVotosPorVotante mayor a 1 cuando el re-voto está deshabilitado.',
      );
    }
    if (
      dto.minIntervaloSegundos !== undefined &&
      (dto.minIntervaloSegundos < 0 ||
        dto.minIntervaloSegundos > MAX_INTERVALO_SEGUNDOS)
    ) {
      throw new UnprocessableEntityException({
        message: 'Configuración de re-voto inválida.',
        errors: [
          {
            field: 'minIntervaloSegundos',
            message: `Debe estar entre 0 y ${MAX_INTERVALO_SEGUNDOS}.`,
          },
        ],
      });
    }
    if (
      !dto.permitirVotoMultiple &&
      dto.minIntervaloSegundos !== undefined &&
      dto.minIntervaloSegundos > 0
    ) {
      throw new UnprocessableEntityException(
        'No se puede establecer minIntervaloSegundos mayor a 0 cuando el re-voto está deshabilitado.',
      );
    }
  }

  private aplicarPoliticaRevoto(
    config: ConfiguracionComicio,
    dto: GuardarConfiguracionRevotoDto,
  ): void {
    if (!dto.permitirVotoMultiple) {
      config.permitirVotoMultiple = false;
      config.maxVotosPorVotante = 1;
      config.minIntervaloSegundos = 0;
      config.politicaRevoto = PoliticaRevoto.DISABLED;
      return;
    }
    config.permitirVotoMultiple = true;
    config.politicaRevoto = PoliticaRevoto.LAST_VOTE_WINS;
    config.maxVotosPorVotante = Math.max(
      MIN_SUFRAGIOS_CON_REVOTO,
      dto.maxVotosPorVotante ?? MIN_SUFRAGIOS_CON_REVOTO,
    );
    config.minIntervaloSegundos = dto.minIntervaloSegundos ?? 0;
  }

  private toRevotoResponse(
    config: ConfiguracionComicio,
    estado: EleccionEstado,
  ): ConfiguracionRevotoResponseDto {
    return {
      idEleccion: config.idEleccion,
      permitirVotoMultiple: config.permitirVotoMultiple,
      maxVotosPorVotante: config.maxVotosPorVotante,
      minIntervaloSegundos: config.minIntervaloSegundos,
      politicaRevoto: config.politicaRevoto,
      editable: estado === EleccionEstado.BORRADOR,
    };
  }

  private async assertEleccionExists(idEleccion: number): Promise<Eleccion> {
    const eleccion = await this.eleccionRepository.findOne({
      where: { idEleccion },
    });
    if (!eleccion) {
      throw new NotFoundException(`Elección ${idEleccion} no encontrada`);
    }
    return eleccion;
  }

  private async findOrCreateConfig(
    idEleccion: number,
  ): Promise<ConfiguracionComicio> {
    const config = await this.configRepository.findOne({
      where: { idEleccion },
    });
    if (!config) {
      throw new NotFoundException(
        `Configuración del comicio ${idEleccion} no encontrada`,
      );
    }
    return config;
  }
}
