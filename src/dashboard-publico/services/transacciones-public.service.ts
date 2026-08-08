import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BlockchainService } from '@/blockchain/blockchain.service';
import { TransaccionesPublicaResponseDto } from '@/dashboard-publico/dto/transacciones-publica-response.dto';
import { ConfiguracionComicio } from '@/eleccion/configuracion-comicio/entities/configuracion-comicio.entity';
import { Eleccion } from '@/eleccion/entities/eleccion.entity';
import { EleccionEstado } from '@/eleccion/enums/eleccion-estado.enum';

const ESTADOS_ELECCION_CERRADOS = [
  EleccionEstado.CERRADA,
  EleccionEstado.ESCRUTADA,
];

const FUENTE_DATOS =
  'BlockScanner: SignedVoteCast + VoteCast + VoteUpdated + CandidateSetRegistered + MerkleRootStore';

@Injectable()
export class TransaccionesPublicService {
  constructor(
    @InjectRepository(Eleccion)
    private readonly eleccionRepository: Repository<Eleccion>,
    @InjectRepository(ConfiguracionComicio)
    private readonly configuracionRepository: Repository<ConfiguracionComicio>,
    private readonly blockchainService: BlockchainService,
  ) {}

  async obtenerTransaccionesPublica(
    idEleccion: number,
  ): Promise<TransaccionesPublicaResponseDto> {
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

    const transacciones =
      await this.blockchainService.scanElectionTransactionHistory(idEleccion);

    return {
      idEleccion,
      snapshotCongelado,
      red: this.blockchainService.getNetworkDisplayName(),
      chainId: this.blockchainService.getChainId(),
      transacciones,
      fuenteDatos: FUENTE_DATOS,
    };
  }
}
