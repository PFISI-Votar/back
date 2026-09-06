export enum TipoEventoAudit {
  ACCESO_DENEGADO = 'ACCESO_DENEGADO',
  LOGIN = 'LOGIN',
  CONFIG_MODIFICADA = 'CONFIG_MODIFICADA',
  PADRON_CARGADO = 'PADRON_CARGADO',
  COMICIO_ABIERTO = 'COMICIO_ABIERTO',
  COMICIO_CERRADO = 'COMICIO_CERRADO',
  /** VOTAR-322: archivado off-chain de un comicio CERRADA. */
  COMICIO_ARCHIVADO = 'COMICIO_ARCHIVADO',
  /** Sufragio anónimo: sin IP/UA/session/votanteHash (VOTAR-379). */
  VOTO_EMITIDO = 'VOTO_EMITIDO',
  /** VOTAR-347: pausa/reanudación de emergencia del comicio. */
  COMICIO_PAUSADO = 'COMICIO_PAUSADO',
  COMICIO_REANUDADO = 'COMICIO_REANUDADO',
  /** Hash SHA-256 del PDF del Acta de Cierre emitido, para verificación de integridad. */
  ACTA_CIERRE_GENERADA = 'ACTA_CIERRE_GENERADA',
  /** VOTAR-377: emisión de una credencial de validación (FASE 1, actor = votante ofuscado). */
  CREDENCIAL_VALIDACION_EMITIDA = 'CREDENCIAL_VALIDACION_EMITIDA',
  /** VOTAR-377: la Entidad de Firmas Digitales certificó un sufragio (FASE 2, actor = ANONIMO). */
  FIRMA_VALIDACION_EMITIDA = 'FIRMA_VALIDACION_EMITIDA',
}
