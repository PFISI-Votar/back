export type MinimoCandidatosCategoriaContext = {
  idCategoria: number;
  nombre: string;
  minimoPostulantes: number;
};

export type MinimoCandidatosListaContext = {
  idLista: number;
  nombre: string;
  sigla: string;
  candidatos: { idCategoria: number }[];
};

export type MinimoCandidatosContext = {
  categorias: MinimoCandidatosCategoriaContext[];
  listas: MinimoCandidatosListaContext[];
};

export type MinimoCandidatosViolation = {
  idLista: number;
  nombreLista: string;
  siglaLista: string;
  idCategoria: number;
  nombreCategoria: string;
  minimoRequerido: number;
  cantidadActual: number;
  faltantes: number;
  message: string;
};

export type MinimoCandidatosValidationResult = {
  valid: boolean;
  violations: MinimoCandidatosViolation[];
};
