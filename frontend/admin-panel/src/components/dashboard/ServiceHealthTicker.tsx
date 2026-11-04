import React from 'react';
import { Badge } from '../common/Badge/Badge';
import { CHART_COLORS } from '@/styles/chartColors';
import type { ServiceHealthRecord, ServiceHealthStatus } from '@/types/health.types';

interface ServiceHealthTickerProps {
  services: ServiceHealthRecord[];
  isLoading?: boolean;
}

const STATUS_DOT: Record<ServiceHealthStatus, string> = {
  healthy: CHART_COLORS.success,
  degraded: CHART_COLORS.warning,
  down: CHART_COLORS.danger,
};

// Data is real (backend/api-gateway's /api/v1/admin/system/health pings every
// service's /health/live server-to-server) — the parent page re-dispatches
// fetchServiceHealthThunk on an interval for "live" refresh, no client-side
// randomization here.
export const ServiceHealthTicker: React.FC<ServiceHealthTickerProps> = ({ services, isLoading }) => {
  const healthyCount = services.filter((s) => s.status === 'healthy').length;
  const degradedCount = services.filter((s) => s.status === 'degraded').length;
  const downCount = services.filter((s) => s.status === 'down').length;

  return (
    <div style={{ backgroundColor: 'var(--color-surface)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)', padding: 'var(--space-4)' }}>
      <style>{'@keyframes muniHealthPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }'}</style>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-3)', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: 'var(--color-text-primary)' }}>Platform Service Health</h3>
          <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: 'var(--color-text-secondary)' }}>
            {services.length} services monitored · {healthyCount} healthy · {degradedCount} degraded · {downCount} down
          </p>
        </div>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--color-text-secondary)' }}>
          <span style={{
            width: 8, height: 8, borderRadius: '50%', backgroundColor: CHART_COLORS.success,
            animation: 'muniHealthPulse 1.6s ease-in-out infinite',
          }} />
          Live
        </span>
      </div>
      {isLoading ? (
        <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 4 }}>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} style={{ minWidth: 190, height: 92, borderRadius: 'var(--radius-md)', backgroundColor: 'var(--color-bg)', flex: '0 0 auto' }} />
          ))}
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 4 }}>
          {services.map((svc) => (
            <div
              key={svc.name}
              style={{
                minWidth: 190, flex: '0 0 auto', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)',
                padding: 'var(--space-3)', display: 'flex', flexDirection: 'column', gap: 6, backgroundColor: 'var(--color-bg)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {svc.name}
                </span>
                <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: STATUS_DOT[svc.status], flexShrink: 0 }} />
              </div>
              <Badge variant={svc.status}>{svc.status}</Badge>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--color-text-secondary)' }}>
                <span>{svc.latencyMs} ms</span>
                <span>{new Date(svc.lastCheckedAt).toLocaleTimeString()}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
