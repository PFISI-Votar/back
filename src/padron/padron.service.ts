import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Readable } from 'stream';
import csvParser from 'csv-parser';
import { EleccionEstado } from '../eleccion/enums/eleccion-estado.enum';
import { ImportarPadronResponseDto } from './dto/importar-padron-response.dto';
import { ListarVotantesResponseDto } from './dto/listar-votantes-response.dto';
import { PadronResumenResponseDto } from './dto/padron-resumen-response.dto';
import { IPadronService } from './interfaces/padron.service.interface';
import { PADRON_REPOSITORY } from './interfaces/padron.repository.interface';
import type { IPadronRepository } from './interfaces/padron.repository.interface';
import { hashPadron, hashVotante } from './utils/keccak.util';

type FilaCsv = Record<string, string>;

const REGEX_DNI = /^\d{7,9}$/;
const REGEX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

@Injectable()
export class PadronService implements IPadronService {
  constructor(
    @Inject(PADRON_REPOSITORY)
    private readonly padronRepository: IPadronRepository,
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

    const filas = await this.parsearCsv(archivo.buffer);
    if (filas.length === 0) {
      throw new BadRequestException('El archivo CSV no contiene registros.');
    }

    const hashesHoja = this.procesarFilas(filas);

    const padron = await this.padronRepository.crearPadronConVotantes({
      idEleccion,
      hashPadron: hashPadron(hashesHoja),
      hashesHoja,
    });

    return {
      idPadron: padron.idPadron,
      idEleccion,
      totalImportados: hashesHoja.length,
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

  private parsearCsv(buffer: Buffer): Promise<FilaCsv[]> {
    return new Promise<FilaCsv[]>((resolve, reject) => {
      const filas: FilaCsv[] = [];
      Readable.from(buffer)
        .pipe(
          csvParser({
            mapHeaders: ({ header }) => header.trim().toLowerCase(),
          }),
        )
        .on('data', (fila: FilaCsv) => filas.push(fila))
        .on('end', () => resolve(filas))
        .on('error', () =>
          reject(
            new BadRequestException(
              'El archivo CSV tiene un formato inválido.',
            ),
          ),
        );
    });
  }

  /**
   * Valida cada registro, hashea la identidad (DNI + email) con Keccak-256 y
   * deduplica por hash. Ante cualquier fila inválida cancela la operación.
   * No registra datos personales en texto plano.
   */
  private procesarFilas(filas: FilaCsv[]): string[] {
    const hashesUnicos = new Set<string>();

    filas.forEach((fila, indice) => {
      const dni = (fila.dni ?? '').trim();
      const email = (fila.email ?? '').trim();
      const numeroFila = indice + 1;

      if (!REGEX_DNI.test(dni.replace(/\D/g, ''))) {
        throw new BadRequestException(`DNI inválido en la fila ${numeroFila}.`);
      }
      if (!REGEX_EMAIL.test(email)) {
        throw new BadRequestException(
          `Email inválido en la fila ${numeroFila}.`,
        );
      }

      hashesUnicos.add(hashVotante(dni, email));
    });

    return [...hashesUnicos];
  }
}
