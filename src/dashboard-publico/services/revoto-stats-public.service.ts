import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BlockchainService } from '@/blockchain/blockchain.service';
import { TransaccionBlockchainService } from '@/blockchain/services/transaccion-blockchain.service';
import { RevotoStatsPublicaResponseDto } from '@/dashboard-publico/dto/revoto-stats-publica-response.dto';
import { ConfiguracionComicio } from '@/eleccion/configuracion-comicio/entities/configuracion-comicio.entity';
import { Eleccion } from '@/eleccion/entities/eleccion.entity';
import { EleccionEstado } from '@/eleccion/enums/eleccion-estado.enum';

const ESTADOS_ELECCION_CERRADOS = [
  EleccionEstado.CERRADA,
  EleccionEstado.ESCRUTADA,
  // VOTAR-322: el archivado es off-chain; el acceso público a la evidencia
  // on-chain debe permanecer intacto tras archivar.
  EleccionEstado.ARCHIVADA,
];

const FUENTE_DATOS =
  'AuditViewContract.getRevoteStats + transaccion_blockchain (VOTAR-373)';

@Injectable()
export class RevotoStatsPublicService {
  constructor(
    @InjectRepository(Eleccion)
    private readonly eleccionRepository: Repository<Eleccion>,
    @InjectRepository(ConfiguracionComicio)
    private readonly configuracionRepository: Repository<ConfiguracionComicio>,
    private readonly blockchainService: BlockchainService,
    private readonly transaccionBlockchainService: TransaccionBlockchainService,
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
      this.transaccionBlockchainService.buildRevoteOverwriteTimeline(
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
