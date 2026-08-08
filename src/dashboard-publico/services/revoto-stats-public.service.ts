import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BlockchainService } from '@/blockchain/blockchain.service';
import { RevotoStatsPublicaResponseDto } from '@/dashboard-publico/dto/revoto-stats-publica-response.dto';
import { ConfiguracionComicio } from '@/eleccion/configuracion-comicio/entities/configuracion-comicio.entity';
import { Eleccion } from '@/eleccion/entities/eleccion.entity';
import { EleccionEstado } from '@/eleccion/enums/eleccion-estado.enum';

const ESTADOS_ELECCION_CERRADOS = [
  EleccionEstado.CERRADA,
  EleccionEstado.ESCRUTADA,
];

const FUENTE_DATOS = 'AuditViewContract.getRevoteStats';

@Injectable()
export class RevotoStatsPublicService {
  constructor(
    @InjectRepository(Eleccion)
    private readonly eleccionRepository: Repository<Eleccion>,
    @InjectRepository(ConfiguracionComicio)
    private readonly configuracionRepository: Repository<ConfiguracionComicio>,
    private readonly blockchainService: BlockchainService,
  ) {}

  async obtenerRevotoStatsPublica(
    idEleccion: number,
    horasVentana = 12,
  ): Promise<RevotoStatsPublicaResponseDto> {
    const eleccion = await this.eleccionRepository.findOne({
      where: { idEleccion },
    });
    if (!eleccion) {
      throw new NotFoundException('Comicio no encontrado');
    }

    const configuracion = await this.configuracionRepository.findOne({
      where: { idEleccion },
    });
    if (!configuracion) {
      throw new NotFoundException('Configuración del comicio no encontrada');
    }

    const resultadosDefinitivos = ESTADOS_ELECCION_CERRADOS.includes(
      eleccion.estado,
    );
    const snapshotCongelado =
      resultadosDefinitivos || !configuracion.mostrarResultadosTiempoReal;

    const [stats, serieTemporal] = await Promise.all([
      this.blockchainService.getRevoteStats(idEleccion),
      this.blockchainService.getRevoteOverwriteTimeline(
        idEleccion,
        horasVentana,
      ),
    ]);

    return {
      idEleccion,
      snapshotCongelado,
      totalRevotes: stats.totalRevotes,
      uniqueVoters: stats.uniqueVoters,
      overwriteRatio: stats.overwriteRatio,
      serieTemporal,
      fuenteDatos: FUENTE_DATOS,
    };
  }
}
