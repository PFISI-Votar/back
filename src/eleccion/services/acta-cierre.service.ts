import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BlockchainService } from '@/blockchain/blockchain.service';
import { ConfiguracionSistemaService } from '@/configuracion-sistema/configuracion-sistema.service';
import { ActaCierreResponseDto } from '@/eleccion/dto/acta-cierre-response.dto';
import { Eleccion } from '@/eleccion/entities/eleccion.entity';
import { EleccionEstado } from '@/eleccion/enums/eleccion-estado.enum';
import { EscrutinioService } from '@/escrutinio/services/escrutinio.service';

const ESTADOS_SIN_CIERRE = [
  EleccionEstado.BORRADOR,
  EleccionEstado.CONFIGURADA,
  EleccionEstado.ABIERTA,
];

/**
 * Compila el Acta de Cierre del comicio (totales de escrutinio, dirección
 * de contratos on-chain). Devuelve los datos consolidados; el PDF se arma
 * client-side (jsPDF), mismo patrón que ActaAperturaService (VOTAR-374).
 * Reutiliza EscrutinioService en vez de recalcular tallies: los datos ya
 * vienen 100% on-chain y congelados una vez CERRADA.
 */
@Injectable()
export class ActaCierreService {
  constructor(
    @InjectRepository(Eleccion)
    private readonly eleccionRepository: Repository<Eleccion>,
    private readonly escrutinioService: EscrutinioService,
    private readonly blockchainService: BlockchainService,
    private readonly configuracionSistemaService: ConfiguracionSistemaService,
  ) {}

  async generar(idEleccion: number): Promise<ActaCierreResponseDto> {
    const eleccion = await this.eleccionRepository.findOne({
      where: { idEleccion },
    });
    if (!eleccion) {
      throw new NotFoundException('Comicio no encontrado');
    }
    if (ESTADOS_SIN_CIERRE.includes(eleccion.estado)) {
      throw new UnprocessableEntityException('El comicio aún no fue cerrado');
    }

    const [escrutinio, onChain, configuracion] = await Promise.all([
      this.escrutinioService.obtenerResultados(idEleccion),
      this.blockchainService.getContratoEstadoOnChain(idEleccion),
      this.configuracionSistemaService.obtener(),
    ]);

    return {
      idEleccion,
      nombreEleccion: eleccion.nombre,
      descripcion: eleccion.descripcion,
      estado: eleccion.estado,
      tipoVotacion: eleccion.tipoVotacion,
      fechaInicio: eleccion.fechaInicio.toISOString(),
      fechaFin: eleccion.fechaFin.toISOString(),
      generadoEn: new Date().toISOString(),
      participacion: escrutinio.participacion,
      candidatos: escrutinio.candidatos,
      logoUrl: configuracion.logoUrl,
      merkleRoot: onChain.merkleRoot,
      red: onChain.red,
      chainId: onChain.chainId,
      contratos: onChain.contratos,
      plantilla: configuracion.actaCierrePlantilla,
      formatoPersonalizado: {
        modo: configuracion.actaCierreModo,
        plantillaTexto: configuracion.actaCierrePlantillaTexto,
      },
    };
  }
}
