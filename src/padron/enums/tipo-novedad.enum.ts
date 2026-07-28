/**
 * Clasifica el motivo por el que una fila del CSV fue omitida durante la
 * importación tolerante del padrón (US-331). Permite reportes detallados y
 * separados por tipo de anomalía.
 */
export enum TipoNovedad {
  DNI_AUSENTE = 'DNI_AUSENTE',
  EMAIL_AUSENTE = 'EMAIL_AUSENTE',
  DNI_INVALIDO = 'DNI_INVALIDO',
  EMAIL_INVALIDO = 'EMAIL_INVALIDO',
  DUPLICADO = 'DUPLICADO',
}
