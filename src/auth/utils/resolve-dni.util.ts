import { AutogestionPersona } from '@/auth/interfaces/autogestion-usuario.interface';

const extractDniFromCuil = (value: string): string | null => {
  const digits = value.replace(/\D/g, '');
  if (digits.length === 11) {
    return digits.slice(2, 10);
  }
  return null;
};

const normalizeDniCandidate = (value: unknown): string | null => {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const nestedCandidates = [
      record.numero,
      record.numeroDocumento,
      record.numero_documento,
      record.nroDocumento,
      record.nro_documento,
      record.value,
    ];
    for (const nested of nestedCandidates) {
      const resolved = normalizeDniCandidate(nested);
      if (resolved) {
        return resolved;
      }
    }
    return null;
  }
  if (
    typeof value !== 'string' &&
    typeof value !== 'number' &&
    typeof value !== 'bigint' &&
    typeof value !== 'boolean'
  ) {
    return null;
  }
  const normalized = String(value).trim();
  if (!normalized) {
    return null;
  }
  const cuilDni = extractDniFromCuil(normalized);
  if (cuilDni) {
    return cuilDni;
  }
  const digits = normalized.replace(/\D/g, '');
  return digits.length >= 7 ? digits : null;
};

export const resolveDni = (persona: AutogestionPersona): string | null => {
  const record = persona as Record<string, unknown>;
  const candidates = [
    persona.dni,
    persona.documento,
    persona.numeroDocumento,
    record.numero_documento,
    record.nroDocumento,
    record.nro_documento,
    record.cuil,
    record.cuit,
  ];
  for (const candidate of candidates) {
    const resolved = normalizeDniCandidate(candidate);
    if (resolved) {
      return resolved;
    }
  }
  return null;
};
