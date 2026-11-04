interface TrackingEvent {
  status: string;
  description: string;
  location: string;
  timestamp: string;
}

interface Props {
  trackingNumber: string;
  events?: TrackingEvent[];
  currentStatus?: string;
}

const STATUS_ORDER = ['order_placed', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered'];

export function OrderTracking({ trackingNumber, events = [], currentStatus }: Props) {
  const currentIdx = STATUS_ORDER.indexOf(currentStatus ?? '');

  return (
    <div style={{ padding: 'var(--space-4)', background: 'var(--color-surface-muted)', borderRadius: 'var(--radius-md)' }}>
      <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginBottom: 'var(--space-3)' }}>
        Tracking: <strong>{trackingNumber}</strong>
      </p>
      {events.length === 0 ? (
        <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'space-between' }}>
          {['Order Placed', 'Picked Up', 'In Transit', 'Out for Delivery', 'Delivered'].map((label, i) => (
            <div key={label} style={{ textAlign: 'center', flex: 1 }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%', margin: '0 auto var(--space-1)',
                background: i <= currentIdx ? 'var(--color-success)' : 'var(--color-border)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, color: i <= currentIdx ? '#fff' : 'var(--color-text-muted)',
              }}>
                {i <= currentIdx ? '✓' : String(i + 1)}
              </div>
              <p style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>{label}</p>
            </div>
          ))}
        </div>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          {events.map((ev, i) => (
            <li key={i} style={{ display: 'flex', gap: 'var(--space-3)', fontSize: 'var(--text-xs)' }}>
              <span style={{ color: 'var(--color-success)', fontWeight: 700 }}>✓</span>
              <div>
                <p style={{ fontWeight: 600 }}>{ev.description}</p>
                <p style={{ color: 'var(--color-text-muted)' }}>{ev.location} · {new Date(ev.timestamp).toLocaleString()}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
