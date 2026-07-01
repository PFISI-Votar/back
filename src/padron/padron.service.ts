import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EleccionEstado } from '../eleccion/enums/eleccion-estado.enum';
import { ImportarPadronResponseDto } from './dto/importar-padron-response.dto';
import { ListarVotantesResponseDto } from './dto/listar-votantes-response.dto';
import { NovedadPadronDto } from './dto/novedad-padron.dto';
import { PadronResumenResponseDto } from './dto/padron-resumen-response.dto';
import { ReporteNovedadesResponseDto } from './dto/reporte-novedades-response.dto';
import { MerkleProofResponseDto } from './dto/merkle-proof-response.dto';
import { MerkleResumenResponseDto } from './dto/merkle-resumen-response.dto';
import { PublicarMerkleResponseDto } from './dto/publicar-merkle-response.dto';
import { TipoNovedad } from './enums/tipo-novedad.enum';
import { MerkleTreeEstado } from './enums/merkle-tree-estado.enum';
import { IPadronService } from './interfaces/padron.service.interface';
import { PADRON_REPOSITORY } from './interfaces/padron.repository.interface';
import type { IPadronRepository } from './interfaces/padron.repository.interface';
import { MerkleBuilderService } from './services/merkle-builder.service';
import { BlockchainService } from '../blockchain/blockchain.service';
import { hashVotante } from './utils/keccak.util';

const REGEX_DNI = /^\d{7,9}$/;
const REGEX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface ResultadoProcesamiento {
  hashesHoja: string[];
  novedades: NovedadPadronDto[];
  totalProcesados: number;
}

@Injectable()
export class PadronService implements IPadronService {
  constructor(
    @Inject(PADRON_REPOSITORY)
    private readonly padronRepository: IPadronRepository,
    private readonly merkleBuilderService: MerkleBuilderService,
    private readonly blockchainService: BlockchainService,
  ) {}

  async importarPadron(
    idEleccion: number,
    archivo: Express.Multer.File,
  ): Promise<ImportarPadronResponseDto> {
    this.validarArchivo(archivo);

    const eleccion =
      await this.padronRepository.buscarEleccionPorId(idEleccion);
    if (!eleccion) {
      throw new NotFoundException(`No existe la elección ${idEleccion}.`);
    }
    if (eleccion.estado !== EleccionEstado.BORRADOR) {
      throw new UnprocessableEntityException(
        'Sólo se puede importar el padrón mientras la elección está en estado BORRADOR.',
      );
    }
    if (await this.padronRepository.existePadronParaEleccion(idEleccion)) {
      throw new ConflictException('La elección ya tiene un padrón cargado.');
    }

    const { hashesHoja, novedades, totalProcesados } = this.procesarCsv(
      archivo.buffer,
    );
    if (totalProcesados === 0) {
      throw new BadRequestException('El archivo CSV no contiene registros.');
    }

    const base = {
      idEleccion,
      totalProcesados,
      totalImportados: hashesHoja.length,
      totalOmitidos: novedades.length,
      novedades,
    };

    // Carga parcial: sólo se persiste si hay al menos una identidad válida.
    // Con 0 válidas igualmente devolvemos las novedades para que la Autoridad
    // Electoral pueda descargar el reporte y corregir el archivo.
    if (hashesHoja.length === 0) {
      return {
        ...base,
        idPadron: null,
        estado: null,
        fechaGeneracion: null,
      };
    }

    const merkleResult = this.merkleBuilderService.buildFromLeaves(hashesHoja);

    const padron = await this.padronRepository.crearPadronConVotantes({
      idEleccion,
      hashPadron: merkleResult.merkleRootCompact,
      sortedLeaves: merkleResult.sortedLeaves,
      merkleRoot: merkleResult.merkleRoot,
      merkleTreeDump: merkleResult.treeDump,
      totalProcesados,
      totalOmitidos: novedades.length,
      novedades,
    });

    return {
      ...base,
      idPadron: padron.idPadron,
      estado: padron.estado,
      fechaGeneracion: padron.fechaGeneracion,
    };
  }

  async obtenerResumen(idEleccion: number): Promise<PadronResumenResponseDto> {
    const padron =
      await this.padronRepository.obtenerPadronPorEleccion(idEleccion);
    if (!padron) {
      throw new NotFoundException(
        `La elección ${idEleccion} no tiene un padrón cargado.`,
      );
    }
    return {
      idPadron: padron.idPadron,
      idEleccion,
      totalVotantesHabilitados: padron.totalVotantesHabilitados,
      hashPadron: padron.hashPadron,
      estado: padron.estado,
      fechaGeneracion: padron.fechaGeneracion,
      totalProcesados: padron.totalProcesados,
      totalOmitidos: padron.totalOmitidos,
    };
  }

  async obtenerReporteNovedades(
    idEleccion: number,
  ): Promise<ReporteNovedadesResponseDto> {
    const padron =
      await this.padronRepository.obtenerPadronPorEleccion(idEleccion);
    if (!padron) {
      throw new NotFoundException(
        `La elección ${idEleccion} no tiene un padrón cargado.`,
      );
    }
    return {
      idEleccion,
      totalProcesados: padron.totalProcesados,
      totalImportados: padron.totalVotantesHabilitados,
      totalOmitidos: padron.totalOmitidos,
      novedades: padron.novedades ?? [],
    };
  }

  async listarVotantes(
    idEleccion: number,
    page: number,
    limit: number,
  ): Promise<ListarVotantesResponseDto> {
    const existe =
      await this.padronRepository.existePadronParaEleccion(idEleccion);
    if (!existe) {
      throw new NotFoundException(
        `La elección ${idEleccion} no tiene un padrón cargado.`,
      );
    }
    const [votantes, total] =
      await this.padronRepository.listarVotantesPaginado(
        idEleccion,
        page,
        limit,
      );
    return {
      items: votantes.map((votante) => ({
        indiceHoja: votante.indiceHoja,
        hashHoja: votante.hashHoja,
        generadoEn: votante.generadoEn,
      })),
      total,
      page,
      limit,
    };
  }

  async eliminarPadron(idEleccion: number): Promise<void> {
    const eleccion =
      await this.padronRepository.buscarEleccionPorId(idEleccion);
    if (!eleccion) {
      throw new NotFoundException(`No existe la elección ${idEleccion}.`);
    }
    if (eleccion.estado !== EleccionEstado.BORRADOR) {
      throw new UnprocessableEntityException(
        'Sólo se puede eliminar el padrón mientras la elección está en estado BORRADOR.',
      );
    }
    if (!(await this.padronRepository.existePadronParaEleccion(idEleccion))) {
      throw new NotFoundException(
        `La elección ${idEleccion} no tiene un padrón cargado.`,
      );
    }
    await this.padronRepository.eliminarPadronPorEleccion(idEleccion);
  }

  async obtenerMerkle(idEleccion: number): Promise<MerkleResumenResponseDto> {
    const merkle =
      await this.padronRepository.obtenerMerklePorEleccion(idEleccion);
    if (!merkle) {
      throw new NotFoundException(
        `La elección ${idEleccion} no tiene un árbol Merkle consolidado.`,
      );
    }
    return this.mapMerkleResumen(merkle);
  }

  async publicarMerkleOnChain(
    idEleccion: number,
  ): Promise<PublicarMerkleResponseDto> {
    const eleccion =
      await this.padronRepository.buscarEleccionPorId(idEleccion);
    if (!eleccion) {
      throw new NotFoundException(`No existe la elección ${idEleccion}.`);
    }

    const estadosBloqueados = [
      EleccionEstado.ABIERTA,
      EleccionEstado.CERRADA,
      EleccionEstado.ESCRUTADA,
    ];
    if (estadosBloqueados.includes(eleccion.estado)) {
      throw new UnprocessableEntityException(
        'No se puede publicar el sello Merkle cuando el comicio ya está abierto, cerrado o escrutado.',
      );
    }

    const merkle =
      await this.padronRepository.obtenerMerklePorEleccion(idEleccion);
    if (!merkle) {
      throw new NotFoundException(
        `La elección ${idEleccion} no tiene un árbol Merkle consolidado.`,
      );
    }

    if (merkle.estado === MerkleTreeEstado.PUBLICADO_ON_CHAIN) {
      throw new ConflictException(
        this.buildPublicarMerkleResponse(idEleccion, merkle),
      );
    }

    if (merkle.estado !== MerkleTreeEstado.GENERADO) {
      throw new UnprocessableEntityException(
        `El árbol Merkle está en estado ${merkle.estado} y no puede publicarse.`,
      );
    }

    const resultado = await this.blockchainService.publishMerkleRoot(
      idEleccion,
      merkle.merkleRoot,
    );

    await this.padronRepository.actualizarPublicacionMerkle(idEleccion, {
      txHashPublicacion: resultado.txHash,
      numeroBloque: resultado.blockNumber,
      fechaPublicacionOnChain: resultado.publishedAt,
      direccionContrato: resultado.contractAddress,
    });

    const merkleActualizado =
      await this.padronRepository.obtenerMerklePorEleccion(idEleccion);
    return this.buildPublicarMerkleResponse(
      idEleccion,
      merkleActualizado ?? merkle,
      resultado.txHash,
      resultado.blockNumber,
      resultado.contractAddress,
      resultado.publishedAt,
    );
  }

  async obtenerProofVotante(
    idEleccion: number,
    hashHoja: string,
  ): Promise<MerkleProofResponseDto> {
    const votante = await this.padronRepository.buscarVotantePorHash(
      idEleccion,
      hashHoja,
    );
    if (!votante) {
      throw new NotFoundException(
        `No se encontró la hoja ${hashHoja} en el padrón de la elección ${idEleccion}.`,
      );
    }
    const merkle =
      await this.padronRepository.obtenerMerklePorEleccion(idEleccion);
    if (!merkle) {
      throw new NotFoundException(
        `La elección ${idEleccion} no tiene un árbol Merkle consolidado.`,
      );
    }
    const merkleProof = this.merkleBuilderService.getProof(
      merkle.treeDump,
      votante.indiceHoja,
    );
    return {
      hashHoja: votante.hashHoja,
      indiceHoja: votante.indiceHoja,
      merkleProof,
      merkleRoot: merkle.merkleRoot,
    };
  }

  private mapMerkleResumen(merkle: {
    merkleRoot: string;
    totalHojas: number;
    version: number;
    estado: MerkleTreeEstado;
    fechaGeneracion: Date;
    txHashPublicacion?: string | null;
    fechaPublicacionOnChain?: Date | null;
    direccionContrato?: string | null;
  }): MerkleResumenResponseDto {
    const resumen: MerkleResumenResponseDto = {
      merkleRoot: merkle.merkleRoot,
      totalHojas: merkle.totalHojas,
      version: merkle.version,
      estado: merkle.estado,
      fechaGeneracion: merkle.fechaGeneracion,
    };
    if (merkle.txHashPublicacion) {
      resumen.txHash = merkle.txHashPublicacion;
      resumen.explorerUrl = this.blockchainService.buildExplorerUrl(
        merkle.txHashPublicacion,
      );
      resumen.fechaPublicacionOnChain =
        merkle.fechaPublicacionOnChain ?? undefined;
      resumen.contractAddress = merkle.direccionContrato ?? undefined;
    }
    return resumen;
  }

  private buildPublicarMerkleResponse(
    idEleccion: number,
    merkle: {
      merkleRoot: string;
      estado: MerkleTreeEstado;
      txHashPublicacion?: string | null;
      numeroBloque?: number | null;
      direccionContrato?: string | null;
      fechaPublicacionOnChain?: Date | null;
    },
    txHash?: string,
    blockNumber?: number,
    contractAddress?: string,
    publishedAt?: Date,
  ): PublicarMerkleResponseDto {
    const hash = txHash ?? merkle.txHashPublicacion ?? '';
    return {
      electionId: idEleccion,
      merkleRoot: merkle.merkleRoot,
      estado: MerkleTreeEstado.PUBLICADO_ON_CHAIN,
      txHash: hash,
      blockNumber: blockNumber ?? merkle.numeroBloque ?? 0,
      contractAddress: contractAddress ?? merkle.direccionContrato ?? '',
      explorerUrl: hash ? this.blockchainService.buildExplorerUrl(hash) : '',
      publishedAt: publishedAt ?? merkle.fechaPublicacionOnChain ?? new Date(),
    };
  }

  private validarArchivo(archivo: Express.Multer.File): void {
    if (!archivo || !archivo.buffer || archivo.size === 0) {
      throw new BadRequestException('Debe adjuntar un archivo CSV no vacío.');
    }
    const esCsv =
      archivo.mimetype.includes('csv') ||
      archivo.originalname.toLowerCase().endsWith('.csv');
    if (!esCsv) {
      throw new BadRequestException('El archivo debe tener formato CSV.');
    }
  }

  /**
   * Procesa el CSV línea por línea (la línea 1 es la cabecera). Tolera filas
   * defectuosas: valida cada registro, hashea la identidad (DNI + email) con
   * Keccak-256, deduplica por hash preservando la primera aparición válida, y
   * consolida cada fila omitida en un registro de novedades con su número de
   * línea físico y motivo. No interrumpe la carga ante anomalías (US-331).
   *
   * El reporte de novedades nunca contiene datos personales en texto plano
   * (Ley 25.326): sólo número de línea y motivo.
   */
  private procesarCsv(buffer: Buffer): ResultadoProcesamiento {
    const lineas = buffer
      .toString('utf-8')
      .split('\n')
      .map((linea) => linea.replace(/\r$/, ''));

    const cabecera = (lineas[0] ?? '')
      .split(',')
      .map((c) => c.trim().toLowerCase());
    const indiceDni = cabecera.indexOf('dni');
    const indiceEmail = cabecera.indexOf('email');
    if (indiceDni === -1 || indiceEmail === -1) {
      throw new BadRequestException(
        'El archivo no tiene las columnas requeridas: dni, email.',
      );
    }

    const hashesUnicos = new Set<string>();
    const novedades: NovedadPadronDto[] = [];
    let totalProcesados = 0;

    for (let i = 1; i < lineas.length; i++) {
      const numeroLinea = i + 1;
      const linea = lineas[i];

      // Las líneas en blanco no son filas de datos: no se cuentan ni reportan.
      if (linea.trim() === '') {
        continue;
      }
      totalProcesados++;

      const celdas = linea.split(',');
      const dni = (celdas[indiceDni] ?? '').trim();
      const email = (celdas[indiceEmail] ?? '').trim();

      if (dni === '') {
        novedades.push(this.crearNovedad(numeroLinea, TipoNovedad.DNI_AUSENTE));
        continue;
      }
      if (email === '') {
        novedades.push(
          this.crearNovedad(numeroLinea, TipoNovedad.EMAIL_AUSENTE),
        );
        continue;
      }
      if (!REGEX_DNI.test(dni.replace(/\D/g, ''))) {
        novedades.push(
          this.crearNovedad(numeroLinea, TipoNovedad.DNI_INVALIDO),
        );
        continue;
      }
      if (!REGEX_EMAIL.test(email)) {
        novedades.push(
          this.crearNovedad(numeroLinea, TipoNovedad.EMAIL_INVALIDO),
        );
        continue;
      }

      const hash = hashVotante(dni, email);
      if (hashesUnicos.has(hash)) {
        novedades.push(this.crearNovedad(numeroLinea, TipoNovedad.DUPLICADO));
        continue;
      }
      hashesUnicos.add(hash);
    }

    novedades.sort((a, b) => a.linea - b.linea);

    return { hashesHoja: [...hashesUnicos], novedades, totalProcesados };
  }

  private crearNovedad(linea: number, tipo: TipoNovedad): NovedadPadronDto {
    const motivos: Record<TipoNovedad, string> = {
      [TipoNovedad.DNI_AUSENTE]: 'Campo DNI ausente',
      [TipoNovedad.EMAIL_AUSENTE]: 'Campo email ausente',
      [TipoNovedad.DNI_INVALIDO]: 'DNI con formato inválido',
      [TipoNovedad.EMAIL_INVALIDO]: 'Email con formato inválido',
      [TipoNovedad.DUPLICADO]:
        'Registro duplicado - Se preservó la primera aparición',
    };
    return { linea, tipo, motivo: `Línea ${linea}: ${motivos[tipo]}` };
  }
}
