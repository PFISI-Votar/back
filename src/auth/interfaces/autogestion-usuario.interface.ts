export interface AutogestionPersona {
  legajo?: string;
  nombre?: string;
  apellido?: string;
  email?: string;
  mail?: string;
}

export interface AutogestionUsuarioResponse {
  persona?: AutogestionPersona;
}

export interface AutogestionLoginResponse {
  hashActual?: string;
}
