import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  ConfiguracionDatosCandidatoResponseDto,
  GuardarConfiguracionDatosCandidatoDto,
} from '@/eleccion/candidato/dto/configuracion-datos-candidato.dto';
import { Candidato } from '@/eleccion/candidato/entities/candidato.entity';
import { CampoDatosCandidato } from '@/eleccion/candidato/entities/campo-datos-candidato.entity';
import { ConfiguracionDatosCandidato } from '@/eleccion/candidato/entities/configuracion-datos-candidato.entity';
import { Eleccion } from '@/eleccion/entities/eleccion.entity';
import {
  CampoCandidatoDefinicion,
  TipoCampoCandidato,
} from '@/eleccion/candidato/interfaces/campo-candidato-definicion.interface';
import {
  mapDefinicionToEntity,
  mapEntitiesToDefiniciones,
} from '@/eleccion/candidato/mappers/campo-datos-candidato.mapper';
import { assertEleccionEditable } from '@/eleccion/utils/eleccion-editable.util';

const CLAVES_RESERVADAS = new Set([
  'nombre',
  'apellido',
  'cargo',
  'foto_url',
  'fotoUrl',
  'orden',
  'id_categoria',
  'idCategoria',
]);

const TIPOS_CAMPO: TipoCampoCandidato[] = [
  'texto',
  'numero',
  'email',
  'url',
  'fecha',
  'booleano',
];

const CONFIG_BLOQUEADA_MESSAGE =
  'La configuración de datos de candidato no puede modificarse porque ya hay candidatos registrados';

@Injectable()
export class ConfiguracionDatosCandidatoService {
  constructor(
    @InjectRepository(ConfiguracionDatosCandidato)
    private readonly configRepository: Repository<ConfiguracionDatosCandidato>,
    @InjectRepository(CampoDatosCandidato)
    private readonly campoRepository: Repository<CampoDatosCandidato>,
    @InjectRepository(Eleccion)
    private readonly eleccionRepository: Repository<Eleccion>,
    @InjectRepository(Candidato)
    private readonly candidatoRepository: Repository<Candidato>,
  ) {}

  async crearConfiguracionPorDefecto(
    idEleccion: number,
  ): Promise<ConfiguracionDatosCandidato> {
    const config = this.configRepository.create({ idEleccion });
    return this.configRepository.save(config);
  }

  async obtenerPorEleccion(
    idEleccion: number,
  ): Promise<ConfiguracionDatosCandidatoResponseDto> {
    await this.assertEleccionExists(idEleccion);
    const config = await this.findOrCreateConfig(idEleccion);
    const cantidadCandidatos = await this.contarCandidatos(idEleccion);
    return {
      idEleccion,
      campos: mapEntitiesToDefiniciones(config.campos ?? []),
      editable: cantidadCandidatos === 0,
      cantidadCandidatos,
    };
  }

  async obtenerCamposPorEleccion(
    idEleccion: number,
  ): Promise<CampoCandidatoDefinicion[]> {
    const config = await this.findOrCreateConfig(idEleccion);
    return mapEntitiesToDefiniciones(config.campos ?? []);
  }

  async guardar(
    idEleccion: number,
    dto: GuardarConfiguracionDatosCandidatoDto,
  ): Promise<ConfiguracionDatosCandidatoResponseDto> {
    const eleccion = await this.assertEleccionExists(idEleccion);
    assertEleccionEditable(eleccion);
    const cantidadCandidatos = await this.contarCandidatos(idEleccion);
    if (cantidadCandidatos > 0) {
      throw new ConflictException(CONFIG_BLOQUEADA_MESSAGE);
    }
    this.validarDefiniciones(dto.campos);
    const camposOrdenados = [...dto.campos].sort((a, b) => a.orden - b.orden);
    let config = await this.configRepository.findOne({
      where: { idEleccion },
    });
    if (!config) {
      config = await this.configRepository.save(
        this.configRepository.create({ idEleccion }),
      );
    }
    await this.campoRepository.delete({
      idConfiguracion: config.idConfiguracion,
    });
    const camposGuardados =
      camposOrdenados.length === 0
        ? []
        : await this.campoRepository.save(
            camposOrdenados.map((definicion) => {
              const entity = mapDefinicionToEntity(definicion);
              entity.idConfiguracion = config.idConfiguracion;
              return entity;
            }),
          );
    return {
      idEleccion,
      campos: mapEntitiesToDefiniciones(camposGuardados),
      editable: true,
      cantidadCandidatos: 0,
    };
  }

  private async findOrCreateConfig(
    idEleccion: number,
  ): Promise<ConfiguracionDatosCandidato> {
    let config = await this.configRepository.findOne({
      where: { idEleccion },
      relations: ['campos'],
    });
    if (!config) {
      config = await this.crearConfiguracionPorDefecto(idEleccion);
      config = await this.configRepository.findOne({
        where: { idConfiguracion: config.idConfiguracion },
        relations: ['campos'],
      });
    }
    if (!config) {
      throw new NotFoundException(
        `Configuración para elección ${idEleccion} no encontrada`,
      );
    }
    return config;
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

  private async contarCandidatos(idEleccion: number): Promise<number> {
    return this.candidatoRepository
      .createQueryBuilder('candidato')
      .innerJoin('candidato.lista', 'lista')
      .innerJoin('lista.boleta', 'boleta')
      .where('boleta.idEleccion = :idEleccion', { idEleccion })
      .getCount();
  }

  private validarDefiniciones(campos: CampoCandidatoDefinicion[]): void {
    if (campos.length === 0) {
      return;
    }
    const claves = new Set<string>();
    const ordenes = new Set<number>();
    for (const campo of campos) {
      if (!TIPOS_CAMPO.includes(campo.tipo)) {
        throw new UnprocessableEntityException(
          `Tipo de campo inválido: ${campo.tipo}`,
        );
      }
      if (CLAVES_RESERVADAS.has(campo.clave)) {
        throw new UnprocessableEntityException(
          `La clave "${campo.clave}" está reservada para datos estructurales`,
        );
      }
      if (claves.has(campo.clave)) {
        throw new UnprocessableEntityException(
          `La clave "${campo.clave}" está duplicada en la configuración`,
        );
      }
      claves.add(campo.clave);
      if (ordenes.has(campo.orden)) {
        throw new UnprocessableEntityException(
          `El orden ${campo.orden} está duplicado en la configuración`,
        );
      }
      ordenes.add(campo.orden);
      if (!/^[a-z][a-z0-9_-]*$/.test(campo.clave)) {
        throw new UnprocessableEntityException(
          `La clave "${campo.clave}" debe usar minúsculas, números y guiones`,
        );
      }
      this.validarReglasDeCampo(campo);
    }
  }

  private validarReglasDeCampo(campo: CampoCandidatoDefinicion): void {
    const validacion = campo.validacion;
    if (!validacion) {
      return;
    }
    if (validacion.pattern) {
      try {
        new RegExp(validacion.pattern);
      } catch {
        throw new UnprocessableEntityException(
          `El patrón de "${campo.clave}" no es una expresión regular válida`,
        );
      }
      if (!['texto', 'email'].includes(campo.tipo)) {
        throw new UnprocessableEntityException(
          `El patrón solo aplica a campos de tipo texto o email (${campo.clave})`,
        );
      }
    }
    if (
      validacion.minLength !== undefined &&
      validacion.maxLength !== undefined &&
      validacion.minLength > validacion.maxLength
    ) {
      throw new UnprocessableEntityException(
        `minLength no puede ser mayor que maxLength en "${campo.clave}"`,
      );
    }
    if (
      validacion.min !== undefined &&
      validacion.max !== undefined &&
      validacion.min > validacion.max
    ) {
      throw new UnprocessableEntityException(
        `min no puede ser mayor que max en "${campo.clave}"`,
      );
    }
    if (
      campo.tipo === 'numero' &&
      (validacion.minLength !== undefined || validacion.maxLength !== undefined)
    ) {
      throw new UnprocessableEntityException(
        `minLength/maxLength no aplican a campos numéricos (${campo.clave})`,
      );
    }
  }
}
