export type TipoCampoCandidato =
  | 'texto'
  | 'numero'
  | 'email'
  | 'url'
  | 'fecha'
  | 'booleano';

export interface ValidacionCampoCandidato {
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  pattern?: string;
  patternMessage?: string;
}

export interface CampoCandidatoDefinicion {
  clave: string;
  etiqueta: string;
  tipo: TipoCampoCandidato;
  obligatorio: boolean;
  ejemplo?: string;
  ayuda?: string;
  orden: number;
  validacion?: ValidacionCampoCandidato;
}

export interface CampoCandidatoError {
  clave: string;
  message: string;
}
