export interface AutogestionPersona {
  legajo?: string;
  nombre?: string;
  apellido?: string;
  email?: string;
  mail?: string;
  dni?: string;
  documento?: string;
  numeroDocumento?: string;
}

export interface AutogestionUsuarioResponse {
  persona?: AutogestionPersona;
}

export interface AutogestionLoginResponse {
  hashActual?: string;
}
