import { ConfiguracionComicio } from '@/eleccion/configuracion-comicio/entities/configuracion-comicio.entity';
import { EleccionEstado } from '@/eleccion/enums/eleccion-estado.enum';

// Duplicada intencionalmente en vez de importar el array homónimo desde
// dashboard-publico/services/participacion-public.service.ts: ese archivo es
// un @Injectable con su propio grafo de dependencias (PadronService, etc.), y
// EleccionGateway/VotoService/SeccionDashboardVisibleGuard importan este
// módulo — importar la constante desde ahí cierra un ciclo real de módulos
// (padron.service → eleccion.gateway → este archivo → participacion-public.service
// → padron.service) que deja servicios `undefined` en el DI de Nest.
const ESTADOS_ELECCION_CERRADOS = [
  EleccionEstado.CERRADA,
  EleccionEstado.ESCRUTADA,
  // VOTAR-322: el archivado es off-chain; el acceso público a la evidencia
  // on-chain debe permanecer intacto tras archivar.
  EleccionEstado.ARCHIVADA,
];

/** Solapas del Dashboard Público cuya visibilidad puede ocultar la autoridad electoral (VOTAR-459). */
export enum SeccionDashboard {
  RESULTADOS = 'resultados',
  PARTICIPACION = 'participacion',
  REVOTO = 'revoto',
  TRANSACCIONES = 'transacciones',
}

/** Mapea cada solapa configurable a su columna en `configuracion_comicio`. */
export const FLAG_POR_SECCION: Record<
  SeccionDashboard,
  keyof ConfiguracionComicio
> = {
  [SeccionDashboard.RESULTADOS]: 'mostrarDashboardResultados',
  [SeccionDashboard.PARTICIPACION]: 'mostrarDashboardParticipacion',
  [SeccionDashboard.REVOTO]: 'mostrarDashboardRevoto',
  [SeccionDashboard.TRANSACCIONES]: 'mostrarDashboardTransacciones',
};

/**
 * VOTAR-459: la visibilidad configurada por la autoridad electoral solo rige
 * mientras el comicio no cerró. Una vez CERRADA/ESCRUTADA/ARCHIVADA, todas las
 * secciones vuelven a ser públicas sin importar el valor de los flags, para no
 * comprometer la transparencia post-comicio.
 */
export const isSeccionDashboardVisible = (
  config: ConfiguracionComicio,
  estado: EleccionEstado,
  seccion: SeccionDashboard,
): boolean => {
  if (ESTADOS_ELECCION_CERRADOS.includes(estado)) {
    return true;
  }
  return config[FLAG_POR_SECCION[seccion]] as boolean;
};
