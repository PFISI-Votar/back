import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { MIN_SUFRAGIOS_CON_REVOTO } from '@/eleccion/configuracion-comicio/constants/revoto.constants';
import { ConfiguracionComicio } from '@/eleccion/configuracion-comicio/entities/configuracion-comicio.entity';
import { PoliticaRevoto } from '@/eleccion/configuracion-comicio/enums/politica-revoto.enum';
import { Eleccion } from '@/eleccion/entities/eleccion.entity';
import { EleccionEstado } from '@/eleccion/enums/eleccion-estado.enum';
import { EstadoRevotoResponseDto } from '@/voto/dto/estado-revoto-response.dto';
import { RegistroIntentoSufragio } from '@/voto/entities/registro-intento-sufragio.entity';

const ESTADOS_APTOS_VOTO = [EleccionEstado.ABIERTA];

@Injectable()
export class RevotePolicyService {
  constructor(
    @InjectRepository(Eleccion)
    private readonly eleccionRepository: Repository<Eleccion>,
    @InjectRepository(ConfiguracionComicio)
    private readonly configuracionRepository: Repository<ConfiguracionComicio>,
    @InjectRepository(RegistroIntentoSufragio)
    private readonly intentoRepository: Repository<RegistroIntentoSufragio>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * VOTAR-328: expone intentos restantes al componente bud.ballot.
   */
  async obtenerEstado(
    idEleccion: number,
    claveIntento: string,
  ): Promise<EstadoRevotoResponseDto> {
    const { config } = await this.loadElectionConfig(idEleccion);
    const registro = await this.intentoRepository.findOne({
      where: { idEleccion, claveIntento },
    });
    return this.buildEstado(config, registro);
  }

  /**
   * Registra un intento consumido tras un cast on-chain exitoso (antes del logout).
   * VOTAR-451 / VOTAR-452 — transactional + optional `votosObjetivo` sync so
   * finalize and catch-up never double-increment for the same on-chain cast.
   */
  async registrarConsumo(
    idEleccion: number,
    claveIntento: string,
    votosObjetivo?: number,
  ): Promise<EstadoRevotoResponseDto> {
    const { eleccion, config } = await this.loadElectionConfig(idEleccion);
    if (!ESTADOS_APTOS_VOTO.includes(eleccion.estado)) {
      throw new ForbiddenException(
        'El comicio no admite nuevos registros de sufragio',
      );
    }

    const maxVotos = this.resolveMaxVotos(config);

    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(RegistroIntentoSufragio);
      let registro = await repo.findOne({
        where: { idEleccion, claveIntento },
        lock: { mode: 'pessimistic_write' },
      });

      if (!registro) {
        registro = repo.create({
          idEleccion,
          claveIntento,
          votosConsumidos: 0,
          ultimoIntentoAt: null,
        });
        await repo.save(registro);
        registro = await repo.findOneOrFail({
          where: { idEleccion, claveIntento },
          lock: { mode: 'pessimistic_write' },
        });
      }

      const target =
        typeof votosObjetivo === 'number'
          ? Math.min(Math.max(votosObjetivo, 0), maxVotos)
          : Math.min(registro.votosConsumidos + 1, maxVotos);

      // Idempotent no-op: already at/above the desired count (catch-up race).
      if (registro.votosConsumidos >= target) {
        return this.buildEstado(config, registro);
      }

      // VOTAR-325 — gate off-chain: fuerza la sincronización con el tiempo real de
      // la red aunque el cliente manipule su reloj local (UAT-02).
      const proximoReintentoEnSegundos = this.calcularSegundosRestantes(
        config,
        registro,
      );
      if (proximoReintentoEnSegundos > 0) {
        throw new HttpException(
          {
            message: 'Debe esperar antes de volver a sufragar.',
            proximoReintentoEnSegundos,
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      registro.votosConsumidos = target;
      registro.ultimoIntentoAt = new Date();
      await repo.save(registro);
      return this.buildEstado(config, registro);
    });
  }

  private async loadElectionConfig(idEleccion: number): Promise<{
    eleccion: Eleccion;
    config: ConfiguracionComicio;
  }> {
    const eleccion = await this.eleccionRepository.findOne({
      where: { idEleccion },
    });
    if (!eleccion) {
      throw new NotFoundException('Comicio no encontrado');
    }
    const config = await this.configuracionRepository.findOne({
      where: { idEleccion },
    });
    if (!config) {
      throw new NotFoundException('Configuración del comicio no encontrada');
    }
    return { eleccion, config };
  }

  private resolveMaxVotos(config: ConfiguracionComicio): number {
    const revoteHabilitado =
      config.permitirVotoMultiple &&
      config.politicaRevoto === PoliticaRevoto.LAST_VOTE_WINS;
    if (!revoteHabilitado) {
      return 1;
    }
    return Math.max(MIN_SUFRAGIOS_CON_REVOTO, config.maxVotosPorVotante);
  }

  /**
   * VOTAR-325 — segundos restantes de cooldown según `minIntervaloSegundos` y el
   * último intento registrado. 0 si no hay cooldown activo. Único punto de cálculo,
   * reutilizado por {buildEstado} (advisory) y {registrarConsumo} (gate 429).
   */
  private calcularSegundosRestantes(
    config: ConfiguracionComicio,
    registro: RegistroIntentoSufragio | null,
  ): number {
    if (!registro?.ultimoIntentoAt || config.minIntervaloSegundos <= 0) {
      return 0;
    }
    const elapsedMs = Date.now() - registro.ultimoIntentoAt.getTime();
    const remainingMs = config.minIntervaloSegundos * 1000 - elapsedMs;
    return remainingMs > 0 ? Math.ceil(remainingMs / 1000) : 0;
  }

  private buildEstado(
    config: ConfiguracionComicio,
    registro: RegistroIntentoSufragio | null,
  ): EstadoRevotoResponseDto {
    const revoteHabilitado =
      config.permitirVotoMultiple &&
      config.politicaRevoto === PoliticaRevoto.LAST_VOTE_WINS;
    const maxVotosPorVotante = this.resolveMaxVotos(config);
    const votosConsumidos = registro?.votosConsumidos ?? 0;
    const intentosRestantes = Math.max(0, maxVotosPorVotante - votosConsumidos);

    const segundosRestantes =
      intentosRestantes > 0
        ? this.calcularSegundosRestantes(config, registro)
        : 0;
    const proximoReintentoEnSegundos =
      segundosRestantes > 0 ? segundosRestantes : undefined;

    const intervaloBloquea =
      typeof proximoReintentoEnSegundos === 'number' &&
      proximoReintentoEnSegundos > 0;

    return {
      revoteHabilitado,
      maxVotosPorVotante,
      votosConsumidos,
      intentosRestantes,
      puedeVotar: intentosRestantes > 0 && !intervaloBloquea,
      minIntervaloSegundos: config.minIntervaloSegundos,
      ...(proximoReintentoEnSegundos !== undefined
        ? { proximoReintentoEnSegundos }
        : {}),
      politicaRevoto: config.politicaRevoto,
    };
  }
}
