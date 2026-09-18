import { Interface } from 'ethers';
import { BALLOT_CAST_ABI } from '@/relayer/ballot-cast.abi';

export type RelayErrorCode =
  | 'already_registered'
  | 'election_closed'
  | 'election_paused'
  | 'insufficient_funds'
  | 'invalid_signature'
  | 'merkle_root_missing'
  | 'network'
  | 'not_eligible'
  | 'retry_too_soon'
  | 'unknown'
  | 'validator_signature';

export type RelayErrorBody = {
  statusCode: number;
  code: RelayErrorCode;
  message: string;
  severity: 'warning' | 'error';
  revertName?: string;
  remainingSeconds?: number;
  isTransient: boolean;
  canRetrySend: boolean;
  canResign: boolean;
};

const iface = new Interface(BALLOT_CAST_ABI);

const collectHexData = (error: unknown, acc: string[] = []): string[] => {
  if (!error || typeof error !== 'object') {
    return acc;
  }
  const record = error as {
    data?: unknown;
    info?: { error?: { data?: unknown } };
    cause?: unknown;
    error?: unknown;
  };
  for (const candidate of [record.data, record.info?.error?.data]) {
    if (typeof candidate === 'string' && candidate.startsWith('0x')) {
      acc.push(candidate);
    }
  }
  collectHexData(record.cause, acc);
  collectHexData(record.error, acc);
  return acc;
};

export const decodeCastRevert = (
  error: unknown,
): { name: string; args: readonly unknown[] } | null => {
  if (error && typeof error === 'object' && 'revert' in error) {
    const revert = (error as { revert?: { name?: string; args?: unknown } })
      .revert;
    if (revert?.name) {
      const args = Array.isArray(revert.args) ? revert.args : [];
      return { name: revert.name, args };
    }
  }
  for (const data of collectHexData(error)) {
    try {
      const parsed = iface.parseError(data);
      if (parsed?.name) {
        return { name: parsed.name, args: parsed.args };
      }
    } catch {
      // selector ajeno al ABI de cast: se prueba el siguiente data
    }
  }
  return null;
};

const body = (
  partial: Omit<RelayErrorBody, 'statusCode'> & { statusCode?: number },
): RelayErrorBody => ({
  statusCode: partial.statusCode ?? 422,
  ...partial,
});

export const mapCastFailure = (error: unknown): RelayErrorBody => {
  const revert = decodeCastRevert(error);
  if (revert) {
    return mapRevertName(revert.name, revert.args);
  }
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : '';
  if (/insufficient funds/i.test(message)) {
    return body({
      statusCode: 503,
      code: 'insufficient_funds',
      message:
        'El relayer no tiene fondos suficientes para pagar el gas. Reintentá más tarde.',
      severity: 'error',
      isTransient: false,
      canRetrySend: true,
      canResign: false,
    });
  }
  if (isTransientNetworkMessage(message)) {
    return body({
      statusCode: 503,
      code: 'network',
      message:
        'No pudimos transmitir el voto a la red. Reintentá el envío. Tu selección se conserva.',
      severity: 'warning',
      isTransient: true,
      canRetrySend: true,
      canResign: false,
    });
  }
  return body({
    code: 'unknown',
    message:
      'Ha ocurrido un error inesperado al transmitir el voto. Verificá tu conexión e intentá nuevamente.',
    severity: 'error',
    isTransient: false,
    canRetrySend: true,
    canResign: true,
  });
};

/** Mensajes de red/transitorios; evita falsos positivos como "unsupported network". */
const isTransientNetworkMessage = (message: string): boolean =>
  /ETIMEDOUT|ECONNRESET|fetch failed|socket hang up/i.test(message) ||
  /\btimeout\b/i.test(message) ||
  /\b(503|429)\b/.test(message) ||
  /\bnetwork (error|request failed|unreachable)\b/i.test(message) ||
  /failed to fetch|networkerror/i.test(message);

/**
 * True cuando el fallo del broadcast sugiere que la tx pudo haber salido
 * (nonce/replacement/timeout/already known): no liberar la capacidad.
 */
export const isLikelySubmittedError = (error: unknown): boolean => {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : '';
  if (
    /already known|nonce|replacement|timeout|underpriced|replacement underpriced/i.test(
      message,
    )
  ) {
    return true;
  }
  if (error && typeof error === 'object' && 'code' in error) {
    const code = String((error as { code?: unknown }).code ?? '');
    if (
      /TIMEOUT|NONCE|REPLACEMENT|NETWORK_ERROR|SERVER_ERROR|UNKNOWN_ERROR/i.test(
        code,
      )
    ) {
      return true;
    }
  }
  return false;
};

export const mapRevertName = (
  revertName: string,
  args: readonly unknown[] = [],
): RelayErrorBody => {
  if (revertName === 'InvalidSignature') {
    return body({
      code: 'invalid_signature',
      message:
        'La firma de su voto no es válida. Asegúrese de que su sesión esté activa y vuelva a intentar.',
      severity: 'error',
      revertName,
      isTransient: false,
      canRetrySend: false,
      canResign: true,
    });
  }
  if (
    revertName === 'MissingValidatorSignature' ||
    revertName === 'InvalidValidatorSignature'
  ) {
    return body({
      code: 'validator_signature',
      message:
        'Firma de validación institucional ausente o inválida. Vuelva a iniciar el proceso de votación para obtener una nueva certificación.',
      severity: 'error',
      revertName,
      isTransient: false,
      canRetrySend: false,
      canResign: true,
    });
  }
  if (revertName === 'EnforcedPause') {
    return body({
      code: 'election_paused',
      message:
        'El comicio se encuentra temporalmente pausado por medidas de seguridad. Por favor, consulte los canales oficiales.',
      severity: 'warning',
      revertName,
      isTransient: false,
      canRetrySend: true,
      canResign: false,
    });
  }
  if (revertName === 'InvalidMerkleProof') {
    return body({
      code: 'not_eligible',
      message:
        'Usted no se encuentra en el padrón electoral habilitado para esta elección.',
      severity: 'error',
      revertName,
      isTransient: false,
      canRetrySend: false,
      canResign: true,
    });
  }
  if (revertName === 'ElectionClosed') {
    return body({
      code: 'election_closed',
      message: 'El horario de votación ha finalizado.',
      severity: 'error',
      revertName,
      isTransient: false,
      canRetrySend: false,
      canResign: false,
    });
  }
  if (
    revertName === 'RevoteDisabled' ||
    revertName === 'AlreadyVoted' ||
    revertName === 'NullifierAlreadyUsed'
  ) {
    return body({
      code: 'already_registered',
      message:
        'Este voto ya está registrado en la blockchain. No es necesario volver a enviarlo.',
      severity: 'error',
      revertName,
      isTransient: false,
      canRetrySend: false,
      canResign: false,
    });
  }
  if (revertName === 'MaxVotesReached') {
    const maxVotes = args[1];
    const maxVotesLabel =
      typeof maxVotes === 'bigint' || typeof maxVotes === 'number'
        ? maxVotes.toString()
        : '';
    return body({
      code: 'already_registered',
      message: `Ya utilizaste los ${maxVotesLabel} sufragios permitidos para esta elección.`,
      severity: 'error',
      revertName,
      isTransient: false,
      canRetrySend: false,
      canResign: false,
    });
  }
  if (revertName === 'RetryTooSoon') {
    return body({
      code: 'retry_too_soon',
      message:
        'Debe esperar antes de volver a votar. El tiempo restante se muestra en pantalla.',
      severity: 'warning',
      revertName,
      remainingSeconds: Number(args[1] ?? 0),
      isTransient: false,
      canRetrySend: false,
      canResign: true,
    });
  }
  if (revertName === 'MerkleRootNotPublished') {
    return body({
      code: 'merkle_root_missing',
      message:
        'El padrón aún no está publicado en la blockchain. Reintentá más tarde.',
      severity: 'warning',
      revertName,
      isTransient: false,
      canRetrySend: true,
      canResign: false,
    });
  }
  if (revertName === 'CandidateSetNotRegistered') {
    return body({
      code: 'merkle_root_missing',
      message:
        'El comicio aún no tiene su oferta electoral sellada en la blockchain. Reintente en unos minutos.',
      severity: 'warning',
      revertName,
      isTransient: false,
      canRetrySend: true,
      canResign: false,
    });
  }
  if (revertName === 'InvalidCandidateId') {
    return body({
      code: 'not_eligible',
      message:
        'La opción seleccionada no pertenece a esta elección. Recargue la boleta e intente nuevamente.',
      severity: 'error',
      revertName,
      isTransient: false,
      canRetrySend: false,
      canResign: false,
    });
  }
  return body({
    code: 'unknown',
    message:
      'Ha ocurrido un error inesperado al transmitir el voto. Verificá tu conexión e intentá nuevamente.',
    severity: 'error',
    revertName,
    isTransient: false,
    canRetrySend: true,
    canResign: true,
  });
};

/** Margen entero sobre estimateGas (110% con techo), igual que el cliente histórico. */
export const applyGasMargin = (estimate: bigint, margin = 1.1): bigint => {
  if (estimate <= 0n) {
    throw new Error('Estimación de gas inválida');
  }
  const percent = BigInt(Math.round(margin * 100));
  return (estimate * percent + 99n) / 100n;
};

export class RelayCastFailedError extends Error {
  constructor(
    readonly relayError: RelayErrorBody,
    /** False cuando la transacción seguro no se envió (simulación / estimación). */
    readonly submitted: boolean,
  ) {
    super(relayError.message);
  }
}
