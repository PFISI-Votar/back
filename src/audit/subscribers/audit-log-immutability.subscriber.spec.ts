import { AuditLogImmutabilitySubscriber } from '@/audit/subscribers/audit-log-immutability.subscriber';

describe('AuditLogImmutabilitySubscriber', () => {
  const subscriber = new AuditLogImmutabilitySubscriber();

  it('listenTo returns AuditLog entity', () => {
    expect(subscriber.listenTo().name).toBe('AuditLog');
  });

  it('beforeUpdate throws append-only error', () => {
    expect(() => subscriber.beforeUpdate()).toThrow(
      'VOTAR-372: audit_log es append-only',
    );
  });

  it('beforeRemove throws append-only error', () => {
    expect(() => subscriber.beforeRemove()).toThrow(
      'VOTAR-372: audit_log es append-only',
    );
  });
});
