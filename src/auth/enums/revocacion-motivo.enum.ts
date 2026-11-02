/**
 * VOTAR-492 §12.2 — motivo por el que una `refresh_session` quedó revocada.
 * Se persiste en `refresh_session.revoked_reason` y alimenta la trazabilidad de
 * la bitácora institucional.
 */
export enum RevocacionMotivo {
  /** Cierre de sesión explícito del usuario. */
  LOGOUT = 'LOGOUT',
  /** Superó `SESSION_IDLE_TIMEOUT` sin actividad. */
  INACTIVIDAD = 'INACTIVIDAD',
  /** Alcanzó el tope absoluto `expires_at` (JWT_REFRESH_EXPIRES_IN). */
  EXPIRACION = 'EXPIRACION',
  /** Revocación administrativa dirigida a un usuario (contención de incidente). */
  REVOCACION_ADMIN = 'REVOCACION_ADMIN',
  /** Revocación masiva global (contención de incidente). */
  REVOCACION_GLOBAL = 'REVOCACION_GLOBAL',
  /** El propio usuario cerró sus otras sesiones activas. */
  CIERRE_OTRAS_SESIONES = 'CIERRE_OTRAS_SESIONES',
}
