import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BlockchainService } from '@/blockchain/blockchain.service';
import { ContratoEstadoPublicaResponseDto } from '@/dashboard-publico/dto/contrato-estado-publica-response.dto';
import { ConfiguracionComicio } from '@/eleccion/configuracion-comicio/entities/configuracion-comicio.entity';
import { Eleccion } from '@/eleccion/entities/eleccion.entity';
import { EleccionEstado } from '@/eleccion/enums/eleccion-estado.enum';

const ESTADOS_ELECCION_CERRADOS = [
  EleccionEstado.CERRADA,
  EleccionEstado.ESCRUTADA,
];

const FUENTE_DATOS =
  'AuditViewContract.getElectionState + MerkleRootStore.getMerkleRoot + ElectionFactory.getElection';

@Injectable()
export class ContratoEstadoPublicService {
  constructor(
    @InjectRepository(Eleccion)
    private readonly eleccionRepository: Repository<Eleccion>,
    @InjectRepository(ConfiguracionComicio)
    private readonly configuracionRepository: Repository<ConfiguracionComicio>,
    private readonly blockchainService: BlockchainService,
  ) {}

  async obtenerContratoEstadoPublica(
    idEleccion: number,
  ): Promise<ContratoEstadoPublicaResponseDto> {
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

    const onChain =
      await this.blockchainService.getContratoEstadoOnChain(idEleccion);

    return {
      idEleccion,
      snapshotCongelado,
      red: onChain.red,
      chainId: onChain.chainId,
      estadoOnChain: onChain.estadoOnChain,
      merkleRoot: onChain.merkleRoot,
      revoto: onChain.revoto,
      contratos: onChain.contratos,
      fuenteDatos: FUENTE_DATOS,
    };
  }
}
