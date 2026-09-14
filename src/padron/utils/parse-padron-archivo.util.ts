import { BadRequestException } from '@nestjs/common';
import { parse as parseCsv } from 'csv-parse/sync';
import * as XLSX from 'xlsx';
import { sanitizarNombreArchivo } from '@/common/uploads/sanitizar-nombre-archivo';

export { sanitizarNombreArchivo };

/** Magic bytes de los formatos de archivo de padrón permitidos (VOTAR-490). */
const XLSX_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]); // ZIP / OOXML
const XLS_MAGIC = Buffer.from([0xd0, 0xcf, 0x11, 0xe0]); // OLE2 compound document

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
  const nombre = sanitizarNombreArchivo(originalname).toLowerCase();
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
  const formato = formatoDeclaradoPorExtension(originalname);
  if (formato === 'csv') {
    return false;
  }
  if (formato === 'xlsx' || formato === 'xls') {
    return true;
  }
  const mime = (mimetype ?? '').toLowerCase();
  return mime.includes('spreadsheet') || mime.includes('excel');
}

const PDF_MAGIC = Buffer.from('%PDF');
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff]);
/** Entrada que distingue un libro OOXML de un zip/docx cualquiera. */
const XLSX_WORKBOOK_ENTRY = 'xl/workbook.xml';
/** Nombre de stream BIFF8, en UTF-16LE, dentro del compound document. */
const XLS_WORKBOOK_STREAM = Buffer.from('Workbook', 'utf16le');

type FormatoPadronDeclarado = 'xlsx' | 'xls' | 'csv';

function empiezaCon(buffer: Buffer, magic: Buffer): boolean {
  return (
    buffer.length >= magic.length && magic.every((b, i) => buffer[i] === b)
  );
}

function formatoPorMime(mimetype: string): FormatoPadronDeclarado | null {
  const mime = (mimetype ?? '').toLowerCase();
  if (mime.includes('spreadsheet') || mime.includes('excel')) {
    return mime.includes('openxml') || mime.includes('sheet') ? 'xlsx' : 'xls';
  }
  if (mime.includes('csv')) {
    return 'csv';
  }
  return null;
}

function formatoDeclaradoPorExtension(
  originalname: string,
): FormatoPadronDeclarado | null {
  const nombre = sanitizarNombreArchivo(originalname).toLowerCase();
  if (nombre.endsWith('.xlsx')) {
    return 'xlsx';
  }
  if (nombre.endsWith('.xls')) {
    return 'xls';
  }
  if (nombre.endsWith('.csv')) {
    return 'csv';
  }
  return null;
}

function esLibroXlsx(buffer: Buffer): boolean {
  if (!empiezaCon(buffer, XLSX_MAGIC)) {
    return false;
  }
  // Un docx/jar/zip también arranca con PK. El libro tiene esta entrada.
  return (
    buffer.includes(XLSX_WORKBOOK_ENTRY) ||
    buffer.includes(XLSX_WORKBOOK_ENTRY.replaceAll('/', '\\'))
  );
}

function esLibroXls(buffer: Buffer): boolean {
  if (!empiezaCon(buffer, XLS_MAGIC)) {
    return false;
  }
  // D0CF11E0 lo comparten .doc/.ppt/.msi. El stream Workbook es de Excel.
  return buffer.includes(XLS_WORKBOOK_STREAM);
}

function csvTieneFirmaBinaria(buffer: Buffer): boolean {
  if (buffer.includes(0x00)) {
    return true;
  }
  if (
    empiezaCon(buffer, PDF_MAGIC) ||
    empiezaCon(buffer, XLSX_MAGIC) ||
    empiezaCon(buffer, XLS_MAGIC) ||
    empiezaCon(buffer, PNG_MAGIC) ||
    empiezaCon(buffer, JPEG_MAGIC)
  ) {
    return true;
  }
  const inicio = buffer
    .subarray(0, 64)
    .toString('utf8')
    .replace(/^\uFEFF/, '')
    .trimStart();
  return inicio.startsWith('<');
}

/**
 * Correlaciona la extensión saneada con la firma real del padrón (VOTAR-490).
 * `.xlsx` exige un zip que sea libro (`xl/workbook.xml`), no cualquier PK.
 * `.xls` exige OLE2 con stream `Workbook`, no cualquier compound document.
 * `.csv` rechaza firmas binarias conocidas (PDF, ZIP, OLE, PNG, JPEG), NUL
 * y markup, no sólo el byte 0x00.
 */
export function validarMagicBytesPadron(
  buffer: Buffer,
  originalname: string,
  mimetype: string,
): void {
  const formato =
    formatoDeclaradoPorExtension(originalname) ?? formatoPorMime(mimetype);
  if (formato === 'xlsx') {
    if (!esLibroXlsx(buffer)) {
      throw new BadRequestException(
        'El contenido del archivo no corresponde a un Excel (.xlsx) válido.',
      );
    }
    return;
  }
  if (formato === 'xls') {
    if (!esLibroXls(buffer)) {
      throw new BadRequestException(
        'El contenido del archivo no corresponde a un Excel (.xls) válido.',
      );
    }
    return;
  }
  if (formato === 'csv') {
    if (csvTieneFirmaBinaria(buffer)) {
      throw new BadRequestException(
        'El contenido del archivo no corresponde a un CSV válido.',
      );
    }
    return;
  }
  throw new BadRequestException(
    'El archivo debe tener formato CSV (.csv) o Excel (.xlsx, .xls).',
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
