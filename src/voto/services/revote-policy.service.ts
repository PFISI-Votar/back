import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
  ) {}

  /**
   * VOTAR-328: expone intentos restantes al componente bud.ballot.
   */
  async obtenerEstado(
    idEleccion: number,
    votanteHash: string,
  ): Promise<EstadoRevotoResponseDto> {
    const { config } = await this.loadElectionConfig(idEleccion);
    const registro = await this.intentoRepository.findOne({
      where: { idEleccion, votanteHash },
    });
    return this.buildEstado(config, registro);
  }

  /**
   * Registra un intento consumido tras un cast on-chain exitoso (antes del logout).
   */
  async registrarConsumo(
    idEleccion: number,
    votanteHash: string,
  ): Promise<EstadoRevotoResponseDto> {
    const { eleccion, config } = await this.loadElectionConfig(idEleccion);
    if (!ESTADOS_APTOS_VOTO.includes(eleccion.estado)) {
      throw new ForbiddenException(
        'El comicio no admite nuevos registros de sufragio',
      );
    }

    const maxVotos = this.resolveMaxVotos(config);
    let registro = await this.intentoRepository.findOne({
      where: { idEleccion, votanteHash },
    });

    if (!registro) {
      registro = this.intentoRepository.create({
        idEleccion,
        votanteHash,
        votosConsumidos: 0,
        ultimoIntentoAt: null,
      });
    }

    if (registro.votosConsumidos < maxVotos) {
      registro.votosConsumidos += 1;
      registro.ultimoIntentoAt = new Date();
      await this.intentoRepository.save(registro);
    }

    return this.buildEstado(config, registro);
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
    return Math.max(1, config.maxVotosPorVotante);
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

    let proximoReintentoEnSegundos: number | undefined;
    if (
      registro?.ultimoIntentoAt &&
      config.minIntervaloSegundos > 0 &&
      intentosRestantes > 0
    ) {
      const elapsedMs = Date.now() - registro.ultimoIntentoAt.getTime();
      const remainingMs = config.minIntervaloSegundos * 1000 - elapsedMs;
      if (remainingMs > 0) {
        proximoReintentoEnSegundos = Math.ceil(remainingMs / 1000);
      }
    }

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
