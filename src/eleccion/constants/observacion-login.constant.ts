export const OBSERVACION_LOGIN_MAX_LENGTH = 1000;

export const OBSERVACION_LOGIN_DEFAULT =
  'El acceso se realiza con tu cuenta institucional. Para poder emitir el voto, el correo electrónico cargado en la sección Datos Personales de Autogestión debe coincidir con el registrado en el padrón electoral.';

export const parseObservacionLogin = (value: string): string | null => {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};
