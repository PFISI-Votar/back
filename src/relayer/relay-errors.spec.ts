import { Interface } from 'ethers';
import { BALLOT_CAST_ABI } from '@/relayer/ballot-cast.abi';
import {
  applyGasMargin,
  decodeCastRevert,
  isLikelySubmittedError,
  mapCastFailure,
} from '@/relayer/relay-errors';

describe('VOTAR-497 relayer errors', () => {
  const iface = new Interface(BALLOT_CAST_ABI);

  it('decodifica RetryTooSoon y no lo marca como reintento de envío', () => {
    const data = iface.encodeErrorResult('RetryTooSoon', [7n, 42n]);
    const mapped = mapCastFailure({ data });
    expect(decodeCastRevert({ data })?.name).toBe('RetryTooSoon');
    expect(mapped).toMatchObject({
      code: 'retry_too_soon',
      remainingSeconds: 42,
      canRetrySend: false,
      canResign: true,
      isTransient: false,
    });
  });

  it('mapea fondos insuficientes sin simular un envío exitoso', () => {
    const mapped = mapCastFailure(new Error('insufficient funds for gas'));
    expect(mapped.code).toBe('insufficient_funds');
    expect(mapped.canRetrySend).toBe(true);
    expect(mapped.isTransient).toBe(false);
  });

  it('no trata "unsupported network" como error de red transitorio', () => {
    const mapped = mapCastFailure(new Error('unsupported network'));
    expect(mapped.code).toBe('unknown');
    expect(mapped.isTransient).toBe(false);
  });

  it('mapea timeouts de red como transitorios', () => {
    const mapped = mapCastFailure(new Error('request timeout'));
    expect(mapped.code).toBe('network');
    expect(mapped.isTransient).toBe(true);
  });

  it('aplica el margen de gas con techo', () => {
    expect(applyGasMargin(100n, 1.1)).toBe(110n);
    expect(applyGasMargin(101n, 1.1)).toBe(112n);
  });

  describe('isLikelySubmittedError', () => {
    it('marca errores de nonce/replacement/timeout como posiblemente enviados', () => {
      expect(isLikelySubmittedError(new Error('nonce too low'))).toBe(true);
      expect(isLikelySubmittedError(new Error('already known'))).toBe(true);
      expect(
        isLikelySubmittedError(new Error('replacement underpriced')),
      ).toBe(true);
      expect(isLikelySubmittedError(new Error('timeout waiting for tx'))).toBe(
        true,
      );
      expect(isLikelySubmittedError({ code: 'NONCE_EXPIRED' })).toBe(true);
    });

    it('no marca reverts de simulación como enviados', () => {
      expect(isLikelySubmittedError(new Error('execution reverted'))).toBe(
        false,
      );
      expect(isLikelySubmittedError(new Error('insufficient funds'))).toBe(
        false,
      );
    });
  });
});
