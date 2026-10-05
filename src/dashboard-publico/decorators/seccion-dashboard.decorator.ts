import { SetMetadata } from '@nestjs/common';
import { SeccionDashboard } from '@/eleccion/configuracion-comicio/constants/visibilidad-dashboard.constants';

export const SECCION_DASHBOARD_METADATA_KEY = 'seccionDashboard';

/**
 * Marca el endpoint público del Dashboard con la solapa que representa, para
 * que `SeccionDashboardVisibleGuard` pueda resolver si sigue oculta (VOTAR-459).
 */
export const SeccionDashboardTag = (seccion: SeccionDashboard) =>
  SetMetadata(SECCION_DASHBOARD_METADATA_KEY, seccion);
