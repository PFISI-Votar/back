import { Interface } from 'ethers';
import { BALLOT_CAST_ABI } from '@/relayer/ballot-cast.abi';
import {
  applyGasMargin,
  decodeCastRevert,
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

  it('aplica el margen de gas con techo', () => {
    expect(applyGasMargin(100n, 1.1)).toBe(110n);
    expect(applyGasMargin(101n, 1.1)).toBe(112n);
  });
});
