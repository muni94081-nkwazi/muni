import { useCallback, useEffect, useState } from 'react';
import { checkServiceHealth, MONITORED_SERVICES, type ServiceHealth } from '@/api/health.api';
import { Button } from '@/components/common/Button/Button';
import { classNames } from '@/utils/helpers';

const POLL_INTERVAL_MS = 15000;

export function SystemStatusPage() {
  const [services, setServices] = useState<ServiceHealth[]>(
    MONITORED_SERVICES.map((s) => ({ ...s, status: 'checking', latencyMs: null })),
  );
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  const checkAll = useCallback(async () => {
    const results = await Promise.all(MONITORED_SERVICES.map((s) => checkServiceHealth(s.name, s.url)));
    setServices(results);
    setLastChecked(new Date());
  }, []);

  useEffect(() => {
    checkAll();
    const interval = setInterval(checkAll, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [checkAll]);

  const upCount = services.filter((s) => s.status === 'up').length;

  return (
    <div className="container" style={{ paddingBlock: 'var(--space-6)', maxWidth: 720 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 'var(--space-2)' }}>
        <h1 style={{ fontSize: 'var(--text-2xl)' }}>System status</h1>
        <Button variant="outline" size="sm" onClick={checkAll}>
          Refresh now
        </Button>
      </div>
      <p style={{ color: 'var(--color-text-secondary)', marginBottom: 'var(--space-6)', fontSize: 'var(--text-sm)' }}>
        {upCount} of {services.length} services reachable
        {lastChecked && ` · last checked ${lastChecked.toLocaleTimeString()}`}
        {' · auto-refreshes every 15s'}
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        {services.map((service) => (
          <div
            key={service.name}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: 'var(--space-3) var(--space-4)',
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-md)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
              <span
                aria-hidden="true"
                className={classNames('status-dot')}
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  background:
                    service.status === 'up'
                      ? 'var(--color-success)'
                      : service.status === 'down'
                        ? 'var(--color-terracotta)'
                        : 'var(--color-border)',
                  flexShrink: 0,
                }}
              />
              <div>
                <p style={{ fontWeight: 600, fontSize: 'var(--text-sm)' }}>{service.name}</p>
                <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', fontFamily: 'var(--font-mono)' }}>
                  {service.url}
                </p>
              </div>
            </div>
            <span
              style={{
                fontSize: 'var(--text-xs)',
                fontWeight: 700,
                fontFamily: 'var(--font-mono)',
                color:
                  service.status === 'up'
                    ? 'var(--color-success)'
                    : service.status === 'down'
                      ? 'var(--color-terracotta-dark)'
                      : 'var(--color-text-secondary)',
              }}
            >
              {service.status === 'up' ? `${service.latencyMs}ms` : service.status === 'down' ? 'unreachable' : 'checking...'}
            </span>
          </div>
        ))}
      </div>

      <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', marginTop: 'var(--space-5)' }}>
        Each row pings that service's own health endpoint directly (bypassing the gateway) so a gateway outage and a
        single-service outage are distinguishable. For request-level tracing across services, the API Gateway also
        exposes its live route table at{' '}
        <code style={{ fontFamily: 'var(--font-mono)' }}>localhost:8080/actuator/gateway/routes</code>.
      </p>
    </div>
  );
}
