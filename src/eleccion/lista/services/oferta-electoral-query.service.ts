import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfiguracionComicio } from '@/eleccion/configuracion-comicio/entities/configuracion-comicio.entity';
import { Eleccion } from '@/eleccion/entities/eleccion.entity';
import { Boleta } from '@/eleccion/lista/entities/boleta.entity';
import { Categoria } from '@/eleccion/lista/entities/categoria.entity';
import { Lista } from '@/eleccion/lista/entities/lista.entity';
import { EstadoBoleta } from '@/eleccion/lista/enums/estado-boleta.enum';
import { EstadoLista } from '@/eleccion/lista/enums/estado-lista.enum';

export type OfertaElectoral = {
  eleccion: Eleccion;
  configuracion: ConfiguracionComicio;
  boleta: Boleta;
  categorias: Categoria[];
  listas: Lista[];
};

/**
 * Read-only query of published ballot + officialized lists/candidates.
 * Shared by BUD (authenticated) and public participation dashboard (VOTAR-365).
 */
@Injectable()
export class OfertaElectoralQueryService {
  constructor(
    @InjectRepository(Eleccion)
    private readonly eleccionRepository: Repository<Eleccion>,
    @InjectRepository(ConfiguracionComicio)
    private readonly configuracionRepository: Repository<ConfiguracionComicio>,
    @InjectRepository(Boleta)
    private readonly boletaRepository: Repository<Boleta>,
    @InjectRepository(Lista)
    private readonly listaRepository: Repository<Lista>,
  ) {}

  /**
   * Loads officialized electoral offer without validating voter eligibility
   * or election open/closed state (caller decides).
   */
  async obtenerOfertaPublicada(idEleccion: number): Promise<OfertaElectoral> {
    const eleccion = await this.eleccionRepository.findOne({
      where: { idEleccion },
    });
    if (!eleccion) {
      throw new NotFoundException(`Elección ${idEleccion} no encontrada`);
    }

    const configuracion = await this.configuracionRepository.findOne({
      where: { idEleccion },
    });
    if (!configuracion) {
      throw new NotFoundException(
        `Configuración del comicio ${idEleccion} no encontrada`,
      );
    }

    const boleta = await this.boletaRepository.findOne({
      where: { idEleccion },
      relations: ['categorias'],
    });
    if (!boleta) {
      throw new NotFoundException(
        `Boleta del comicio ${idEleccion} no encontrada`,
      );
    }
    if (boleta.estado !== EstadoBoleta.PUBLICADA) {
      throw new ForbiddenException('La boleta no está publicada');
    }

    const categorias = (boleta.categorias ?? [])
      .slice()
      .sort((a, b) => a.orden - b.orden || a.idCategoria - b.idCategoria);
    const listas = await this.listaRepository.find({
      where: { idBoleta: boleta.idBoleta, estado: EstadoLista.OFICIALIZADA },
      relations: ['candidatos'],
    });

    const listasOrdenadas = listas
      .filter((lista) => lista.listId !== null || lista.candidatos?.length > 0)
      .sort(
        (a, b) =>
          (a.listId ?? a.idLista) - (b.listId ?? b.idLista) ||
          a.idLista - b.idLista,
      )
      .map((lista) => ({
        ...lista,
        candidatos: (lista.candidatos ?? [])
          .slice()
          .sort((a, b) => a.orden - b.orden || a.idCandidato - b.idCandidato),
      })) as Lista[];

    return {
      eleccion,
      configuracion,
      boleta,
      categorias,
      listas: listasOrdenadas,
    };
  }
}
