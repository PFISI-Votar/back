import { BadRequestException } from '@nestjs/common';
import { parse as parseCsv } from 'csv-parse/sync';
import * as XLSX from 'xlsx';

export interface FilaPadronIdentidad {
  /** Número de fila 1-based en el archivo (incluye cabecera como fila 1). */
  linea: number;
  dni: string;
  email: string;
}

const EXTENSIONES_EXCEL = ['.xlsx', '.xls'] as const;
const EXTENSIONES_CSV = ['.csv'] as const;

export function esArchivoPadronSoportado(
  originalname: string,
  mimetype: string,
): boolean {
  const nombre = originalname.toLowerCase();
  const mime = (mimetype ?? '').toLowerCase();
  const esCsvPorExtension = EXTENSIONES_CSV.some((ext) => nombre.endsWith(ext));
  // text/plain solo se acepta si la extensión es .csv (no cualquier plain text).
  if (esCsvPorExtension || mime.includes('csv')) {
    return true;
  }
  if (
    EXTENSIONES_EXCEL.some((ext) => nombre.endsWith(ext)) ||
    mime.includes('spreadsheet') ||
    mime.includes('excel')
  ) {
    return true;
  }
  return false;
}

export function esExcel(originalname: string, mimetype: string): boolean {
  const nombre = originalname.toLowerCase();
  const mime = (mimetype ?? '').toLowerCase();
  return (
    EXTENSIONES_EXCEL.some((ext) => nombre.endsWith(ext)) ||
    mime.includes('spreadsheet') ||
    mime.includes('excel')
  );
}

/**
 * Extrae filas de identidad (dni + email) desde CSV o Excel.
 * Columnas adicionales se ignoran (generalización VOTAR-417).
 * Sólo se usan `dni` y `email` para el hash Keccak-256 (Ley 25.326).
 * En Excel sólo se procesa la primera hoja del libro.
 */
export function extraerFilasIdentidad(
  buffer: Buffer,
  originalname: string,
  mimetype: string,
): FilaPadronIdentidad[] {
  const filas = esExcel(originalname, mimetype)
    ? leerFilasExcel(buffer)
    : leerFilasCsv(buffer);

  if (filas.length === 0 || filas[0] === null) {
    throw new BadRequestException(
      'El archivo no tiene las columnas requeridas: dni, email.',
    );
  }

  const cabecera = filas[0].map((c) => c.trim().toLowerCase());
  const indiceDni = cabecera.indexOf('dni');
  const indiceEmail = cabecera.indexOf('email');
  if (indiceDni === -1 || indiceEmail === -1) {
    throw new BadRequestException(
      'El archivo no tiene las columnas requeridas: dni, email.',
    );
  }

  const resultado: FilaPadronIdentidad[] = [];
  for (let i = 1; i < filas.length; i++) {
    const celdas = filas[i];
    // Líneas/filas en blanco no son registros: no se cuentan ni reportan.
    if (celdas === null) {
      continue;
    }
    resultado.push({
      linea: i + 1,
      dni: (celdas[indiceDni] ?? '').trim(),
      email: (celdas[indiceEmail] ?? '').trim(),
    });
  }
  return resultado;
}

/** `null` marca una línea en blanco (omitida del procesamiento). */
function leerFilasCsv(buffer: Buffer): Array<string[] | null> {
  const lineas = buffer
    .toString('utf-8')
    .replace(/^\uFEFF/, '')
    .split('\n')
    .map((linea) => linea.replace(/\r$/, ''));

  return lineas.map((linea) => {
    if (linea.trim() === '') {
      return null;
    }
    const [celdas] = parseCsv(linea, {
      relax_column_count: true,
      relax_quotes: true,
      skip_empty_lines: false,
    }) as string[][];
    return (celdas ?? []).map((celda) => String(celda ?? ''));
  });
}

function leerFilasExcel(buffer: Buffer): Array<string[] | null> {
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: 'buffer' });
  } catch {
    throw new BadRequestException(
      'No se pudo leer el archivo Excel. Verifique que el formato sea .xlsx o .xls.',
    );
  }

  // Sólo la primera hoja: el padrón debe estar en Sheet1 / primera pestaña.
  const nombreHoja = workbook.SheetNames[0];
  if (!nombreHoja) {
    throw new BadRequestException('El archivo Excel no contiene hojas.');
  }

  const hoja = workbook.Sheets[nombreHoja];
  const matriz = XLSX.utils.sheet_to_json<string[]>(hoja, {
    header: 1,
    defval: '',
    raw: false,
    blankrows: true,
  });

  return matriz.map((fila) => {
    const celdas = (Array.isArray(fila) ? fila : []).map((celda) =>
      String(celda ?? ''),
    );
    if (celdas.every((c) => c.trim() === '')) {
      return null;
    }
    return celdas;
  });
}
