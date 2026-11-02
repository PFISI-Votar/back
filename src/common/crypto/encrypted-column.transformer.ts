import { ValueTransformer } from 'typeorm';
import {
  decryptField,
  encryptField,
  isEncrypted,
  resolveFieldKey,
} from '@/common/crypto/field-encryption';

/**
 * VOTAR-498 — primer `ValueTransformer` del repo. Cifra en `to()` (escritura)
 * y descifra en `from()` (lectura) columnas `text` marcadas como sensibles.
 *
 * - Passthrough en claro cuando no hay `DB_ENCRYPTION_KEY` configurada en
 *   desarrollo (ver {@link resolveFieldKey}): permite levantar el stack local
 *   sin generar una clave todavía, sin romper el login/2FA.
 * - `from()` es tolerante a lectura: si el valor no tiene el prefijo
 *   `enc:v1:` (fila insertada antes del backfill de la migración, o entorno
 *   sin clave), se devuelve tal cual en vez de lanzar — evita que una fila
 *   legacy tumbe el login de una autoridad.
 * - `null`/`undefined` pasan sin tocar en ambas direcciones.
 */
export const encryptedColumn = (): ValueTransformer => ({
  to(value: string | null | undefined): string | null | undefined {
    if (value === null || value === undefined) return value;
    const key = resolveFieldKey();
    if (!key) return value;
    return encryptField(value, key);
  },
  from(value: string | null | undefined): string | null | undefined {
    if (value === null || value === undefined) return value;
    if (!isEncrypted(value)) return value;
    const key = resolveFieldKey();
    if (!key) return value;
    return decryptField(value, key);
  },
});
