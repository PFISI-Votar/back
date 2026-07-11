/** Claves de datos adicionales que deben ser únicas por comicio. */
export const CLAVES_DATOS_CANDIDATO_UNICOS = ['legajo_utn'] as const;

export type ClaveDatoCandidatoUnico =
  (typeof CLAVES_DATOS_CANDIDATO_UNICOS)[number];
