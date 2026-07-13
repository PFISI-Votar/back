import { buildReciboCanonicalPayload } from '@/voto/lib/recibo-canonical';

describe('recibo-canonical', () => {
  it('normaliza txHash a minúsculas en el payload canónico', () => {
    const payload = buildReciboCanonicalPayload({
      idEleccion: 7,
      txHash:
        '0xABCDEF1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF1234567890',
      blockNumber: 10,
      timestamp: '2026-07-11T14:30:00.000Z',
    });

    expect(payload).toBe(
      'VOTAR-RECIBO-v1|idEleccion=7|txHash=0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890|blockNumber=10|timestamp=2026-07-11T14:30:00.000Z',
    );
  });
});
