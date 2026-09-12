import { existsSync, readFileSync } from 'node:fs';
import type { ConnectionOptions as TlsConnectionOptions } from 'node:tls';

/**
 * VOTAR-498 — resuelve la configuración TLS hacia PostgreSQL a partir de
 * variables de entorno, compartida por las tres rutas de conexión del
 * backend (TypeORM runtime, DataSource de migraciones, subprocesos
 * pg_dump/pg_restore). Se recibe un {@link EnvGetter} en vez de un
 * `ConfigService` para poder reusarse tanto desde Nest (`ConfigService.get`)
 * como desde `data-source.ts` (`process.env`), que hoy leen de formas
 * distintas y no deben divergir en esta política.
 *
 * Riesgo Threagile mitigado: `unencrypted-communication` — sin esto, la
 * conexión (credenciales SCRAM incluidas) viaja en texto plano.
 */
export type DbSslMode = 'disable' | 'require' | 'verify-ca' | 'verify-full';

export type EnvGetter = (key: string) => string | undefined;

const VALID_MODES: readonly DbSslMode[] = [
  'disable',
  'require',
  'verify-ca',
  'verify-full',
];

const isPemInline = (value: string): boolean => value.includes('-----BEGIN');

/**
 * Acepta el valor de una env de certificado como ruta de archivo o como PEM
 * inline (para no forzar un volumen montado en despliegues gestionados que
 * inyectan el certificado directamente como variable de entorno).
 */
const readCertMaterial = (
  value: string | undefined,
  envKey: string,
): string | undefined => {
  if (!value?.trim()) return undefined;
  const trimmed = value.trim();
  if (isPemInline(trimmed)) return trimmed;
  if (!existsSync(trimmed)) {
    throw new Error(
      `VOTAR-498: ${envKey} no es un PEM inline ni una ruta de archivo existente (${trimmed}).`,
    );
  }
  return readFileSync(trimmed, 'utf8');
};

/**
 * Determina si el entorno actual es de producción a partir de `DEVELOPMENT`,
 * únicamente para decidir cuán estricta debe ser la política TLS/cifrado de
 * esta configuración de base de datos.
 *
 * Deliberadamente **no** reutiliza `resolveIsProduction` de
 * `security-headers.config.ts`: los e2e existentes (`security-headers.e2e-spec.ts`,
 * `rate-limit-cors.e2e-spec.ts`) mockean esa función con `jest.spyOn` para
 * forzar "modo producción" solo en las cabeceras HTTP, sin tocar el resto del
 * entorno de test (Postgres real sin TLS). Si `database.config.ts` dependiera
 * de la misma función mockeable, ese mock arrancaría el fail-closed de TLS
 * (`DB_SSL_MODE=disable` en producción) y tumbaría esos tests por un motivo
 * ajeno a lo que verifican. Esta política de base de datos se basa en el
 * valor real de `DEVELOPMENT` en el entorno.
 */
export const isDatabaseProductionEnv = (
  get: (key: string) => unknown,
): boolean => {
  const development = get('DEVELOPMENT');
  return development !== 'true' && development !== true;
};

const parseMode = (raw: string | undefined): DbSslMode => {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return 'disable';
  if (!VALID_MODES.includes(trimmed as DbSslMode)) {
    throw new Error(
      `VOTAR-498: DB_SSL_MODE inválido ("${trimmed}"). Valores permitidos: ${VALID_MODES.join(', ')}.`,
    );
  }
  return trimmed as DbSslMode;
};

/**
 * Resuelve las opciones `ssl` para el driver `pg` (node-postgres / TypeORM).
 *
 * Fail-closed: en producción (`isProduction === true`) rechaza `disable` y
 * exige `DB_SSL_CA` para `verify-ca`/`verify-full`. No degrada en silencio a
 * una conexión sin cifrar ni a validación laxa cuando falta configuración.
 */
export const resolveDatabaseSsl = (
  get: EnvGetter,
  isProduction: boolean,
): false | TlsConnectionOptions => {
  const mode = parseMode(get('DB_SSL_MODE'));

  if (isProduction && mode === 'disable') {
    throw new Error(
      'VOTAR-498: DB_SSL_MODE=disable no está permitido en producción (DEVELOPMENT=false). ' +
        'Configurar "require", "verify-ca" o "verify-full".',
    );
  }

  if (mode === 'disable') return false;

  const ca = readCertMaterial(get('DB_SSL_CA'), 'DB_SSL_CA');
  const cert = readCertMaterial(get('DB_SSL_CERT'), 'DB_SSL_CERT');
  const key = readCertMaterial(get('DB_SSL_KEY'), 'DB_SSL_KEY');
  const servername = get('DB_SSL_SERVERNAME')?.trim() || undefined;

  if (mode === 'require') {
    // Cifra el canal pero no valida la cadena de certificados: solo protege
    // contra un sniffer pasivo, no contra un MITM activo.
    return { rejectUnauthorized: false, ca, cert, key };
  }

  if (!ca) {
    throw new Error(
      `VOTAR-498: DB_SSL_MODE=${mode} requiere DB_SSL_CA (ruta o PEM inline).`,
    );
  }

  if (mode === 'verify-ca') {
    return {
      ca,
      cert,
      key,
      rejectUnauthorized: true,
      // Valida la cadena contra la CA pero no el hostname del certificado
      // (útil cuando el servidor se accede por IP o por un nombre de
      // servicio Docker que no coincide con el CN/SAN del certificado).
      checkServerIdentity: () => undefined,
    };
  }

  // verify-full
  return {
    ca,
    cert,
    key,
    rejectUnauthorized: true,
    servername,
  };
};

/**
 * Variables de entorno equivalentes para los subprocesos `pg_dump`/`pg_restore`
 * (libpq), que no comparten el pool de conexión de TypeORM y por lo tanto
 * quedarían fuera de esta política si no se les inyectan explícitamente.
 */
export const buildLibpqSslEnv = (
  get: EnvGetter,
): Partial<NodeJS.ProcessEnv> => {
  const mode = parseMode(get('DB_SSL_MODE'));
  if (mode === 'disable') {
    return { PGSSLMODE: 'disable' };
  }

  const env: Partial<NodeJS.ProcessEnv> = { PGSSLMODE: mode };
  const ca = get('DB_SSL_CA')?.trim();
  const cert = get('DB_SSL_CERT')?.trim();
  const key = get('DB_SSL_KEY')?.trim();
  // libpq espera rutas de archivo, no PEM inline; si viene inline no se
  // puede honrar acá (solo el driver `pg` acepta contenido en memoria), así
  // que se omite en ese caso y se documenta la limitación.
  if (ca && !isPemInline(ca)) env.PGSSLROOTCERT = ca;
  if (cert && !isPemInline(cert)) env.PGSSLCERT = cert;
  if (key && !isPemInline(key)) env.PGSSLKEY = key;
  return env;
};
