import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BlockchainService } from '@/blockchain/blockchain.service';
import { ConfiguracionSistemaService } from '@/configuracion-sistema/configuracion-sistema.service';
import {
  ActaAperturaCandidatoDto,
  ActaAperturaCategoriaDto,
  ActaAperturaResponseDto,
} from '@/eleccion/dto/acta-apertura-response.dto';
import { Eleccion } from '@/eleccion/entities/eleccion.entity';
import { EleccionEstado } from '@/eleccion/enums/eleccion-estado.enum';
import { OfertaElectoralQueryService } from '@/eleccion/lista/services/oferta-electoral-query.service';
import { PadronService } from '@/padron/padron.service';

const ESTADOS_SIN_APERTURA = [
  EleccionEstado.BORRADOR,
  EleccionEstado.CONFIGURADA,
];

/**
 * VOTAR-374: compila el Acta de Apertura del comicio (padrón, oferta
 * electoral, raíz de Merkle anclada y contratos on-chain). Devuelve los
 * datos consolidados; el PDF se arma client-side (jsPDF) siguiendo el mismo
 * patrón que el recibo de votación (VOTAR-360) y la exportación de
 * escrutinio.
 */
@Injectable()
export class ActaAperturaService {
  constructor(
    @InjectRepository(Eleccion)
    private readonly eleccionRepository: Repository<Eleccion>,
    private readonly padronService: PadronService,
    private readonly ofertaElectoralQueryService: OfertaElectoralQueryService,
    private readonly blockchainService: BlockchainService,
    private readonly configuracionSistemaService: ConfiguracionSistemaService,
  ) {}

  async generar(idEleccion: number): Promise<ActaAperturaResponseDto> {
    const eleccion = await this.eleccionRepository.findOne({
      where: { idEleccion },
    });
    if (!eleccion) {
      throw new NotFoundException('Comicio no encontrado');
    }
    if (ESTADOS_SIN_APERTURA.includes(eleccion.estado)) {
      throw new UnprocessableEntityException('El comicio aún no fue abierto');
    }

    const [padron, oferta, onChain, configuracion] = await Promise.all([
      this.padronService.obtenerResumenPadron(idEleccion),
      this.ofertaElectoralQueryService.obtenerOfertaPublicada(idEleccion),
      this.blockchainService.getContratoEstadoOnChain(idEleccion),
      this.configuracionSistemaService.obtener(),
    ]);

    return {
      idEleccion,
      nombreEleccion: eleccion.nombre,
      descripcion: eleccion.descripcion,
      estado: eleccion.estado,
      fechaInicio: eleccion.fechaInicio.toISOString(),
      fechaFin: eleccion.fechaFin.toISOString(),
      generadoEn: new Date().toISOString(),
      datosApertura: eleccion.aperturaModo
        ? {
            modo: eleccion.aperturaModo,
            realizadaEn: (eleccion.aperturaRealEn as Date).toISOString(),
            actorNombre: eleccion.aperturaActorNombre,
            actorRol: eleccion.aperturaActorRol,
          }
        : null,
      padron,
      logoUrl: configuracion.logoUrl,
      categorias: this.buildCategorias(oferta.categorias, oferta.listas),
      merkleRoot: onChain.merkleRoot,
      red: onChain.red,
      chainId: onChain.chainId,
      contratos: onChain.contratos,
      plantilla: configuracion.actaAperturaPlantilla,
      formatoPersonalizado: {
        modo: configuracion.actaAperturaModo,
        plantillaTexto: configuracion.actaAperturaPlantillaTexto,
      },
    };
  }

  private buildCategorias(
    categorias: { idCategoria: number; nombre: string }[],
    listas: {
      nombre: string;
      sigla: string;
      candidatos: {
        idCandidato: number;
        nombre: string;
        apellido: string;
        idCategoria: number;
        orden: number;
      }[];
    }[],
  ): ActaAperturaCategoriaDto[] {
    const candidatosPorCategoria = new Map<
      number,
      ActaAperturaCandidatoDto[]
    >();

    for (const lista of listas) {
      for (const candidato of lista.candidatos ?? []) {
        const entry: ActaAperturaCandidatoDto = {
          idCandidato: candidato.idCandidato,
          nombreCompleto: `${candidato.apellido}, ${candidato.nombre}`,
          listaNombre: lista.nombre,
          listaSigla: lista.sigla,
          orden: candidato.orden,
        };
        const existentes =
          candidatosPorCategoria.get(candidato.idCategoria) ?? [];
        existentes.push(entry);
        candidatosPorCategoria.set(candidato.idCategoria, existentes);
      }
    }

    return categorias.map((categoria) => ({
      idCategoria: categoria.idCategoria,
      nombre: categoria.nombre,
      candidatos: (candidatosPorCategoria.get(categoria.idCategoria) ?? [])
        .slice()
        .sort((a, b) => a.orden - b.orden),
    }));
  }
}
