import { useEffect, useState } from 'react';
import { apiClient } from '@/api/axios.config';
import { formatDateTime } from '@/utils/formatters';
import { LoadingState } from '@/components/common/LoadingState';

interface Notification {
  id: string;
  group_id: string;
  type: string;
  channel: string;
  status: string;
  recipient: string;
  subject: string | null;
  attempts: number;
  last_error: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  created_at: string;
}

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  pending:   { bg: '#fff8e1', text: '#f57f17' },
  sent:      { bg: '#e3f2fd', text: '#1565c0' },
  delivered: { bg: '#e8f5e9', text: '#2e7d32' },
  failed:    { bg: '#ffebee', text: '#b71c1c' },
};

const CHANNEL_ICON: Record<string, string> = {
  sms: '📱',
  email: '✉️',
};

export function AdminNotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [filtered, setFiltered] = useState<Notification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [channelFilter, setChannelFilter] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    // notification-service is internal-only, so this hits the backend
    // admin endpoint via the gateway. Only reachable if the user has
    // ROLE_ADMIN and the gateway routes /admin/* to a future admin
    // service, or if we proxy through a dedicated admin API.
    // For now we show a helpful message if unreachable.
    apiClient
      .get<{ data: Notification[] }>('/notifications/recent', { params: { per_page: 50 } })
      .then((res) => {
        const list = Array.isArray(res.data.data) ? res.data.data : [];
        setNotifications(list);
        setFiltered(list);
      })
      .catch(() => {
        setError(
          'Notification history is a service-to-service endpoint (not exposed through the gateway by design). ' +
          'To view notifications, query notification-service directly at http://localhost:8085/api/v1/notifications/user/{userId} ' +
          'with X-Internal-Token from your .env file.',
        );
        setNotifications([]);
        setFiltered([]);
      })
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    let result = notifications;
    if (statusFilter) result = result.filter((n) => n.status === statusFilter);
    if (channelFilter) result = result.filter((n) => n.channel === channelFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (n) =>
          n.recipient.toLowerCase().includes(q) ||
          n.type.toLowerCase().includes(q) ||
          (n.subject ?? '').toLowerCase().includes(q),
      );
    }
    setFiltered(result);
  }, [notifications, statusFilter, channelFilter, search]);

  if (isLoading) return <LoadingState label="Loading notifications..." />;

  const statuses = ['pending', 'sent', 'delivered', 'failed'];
  const counts = statuses.reduce(
    (acc, s) => { acc[s] = notifications.filter((n) => n.status === s).length; return acc; },
    {} as Record<string, number>,
  );

  return (
    <div>
      <div style={{ marginBottom: 'var(--space-5)' }}>
        <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 700 }}>Notification Log</h1>
        <p style={{ color: '#666', fontSize: 'var(--text-sm)' }}>
          SMS and email delivery history across all platform events
        </p>
      </div>

      {error && (
        <div style={{
          background: '#fff8e1',
          border: '1px solid #ffe082',
          borderRadius: 'var(--radius-md)',
          padding: 'var(--space-5)',
          marginBottom: 'var(--space-5)',
          fontSize: 'var(--text-sm)',
          color: '#5d4037',
        }}>
          <div style={{ fontWeight: 700, marginBottom: 'var(--space-2)' }}>⚠️ Notification service not reachable via gateway</div>
          <p>{error}</p>
          <div style={{ marginTop: 'var(--space-3)', fontFamily: 'var(--font-mono)', background: '#fff3e0', padding: 'var(--space-3)', borderRadius: 'var(--radius-sm)', fontSize: 'var(--text-xs)' }}>
            curl -H "X-Internal-Token: $INTERNAL_SERVICE_TOKEN" \<br />
            &nbsp;&nbsp;http://localhost:8085/api/v1/notifications/user/{'{'}{'{'}userId{'}'}{'}'}
          </div>
          <div style={{ marginTop: 'var(--space-3)', color: '#666' }}>
            To expose notifications to admins through the gateway, add a
            <code style={{ fontFamily: 'var(--font-mono)', background: '#f5f5f5', padding: '1px 4px', borderRadius: 2 }}> /admin/notifications/**</code> route
            in <code style={{ fontFamily: 'var(--font-mono)', background: '#f5f5f5', padding: '1px 4px', borderRadius: 2 }}>application.yml</code> with
            a <code style={{ fontFamily: 'var(--font-mono)', background: '#f5f5f5', padding: '1px 4px', borderRadius: 2 }}>JwtAuthenticationFilter + AddRequestHeader(X-Internal-Token, ...)</code> filter chain.
          </div>
        </div>
      )}

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--space-3)', marginBottom: 'var(--space-5)' }}>
        {statuses.map((s) => {
          const sc = STATUS_COLORS[s] ?? { bg: '#f0f0f0', text: '#333' };
          return (
            <div key={s} style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: 'var(--radius-md)', padding: 'var(--space-4)', textAlign: 'center' }}>
              <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, color: sc.text }}>{counts[s] ?? 0}</div>
              <div style={{ fontSize: 'var(--text-xs)', color: '#888', marginTop: 4, textTransform: 'capitalize' }}>{s}</div>
            </div>
          );
        })}
      </div>

      {/* Filters */}
      <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: 'var(--radius-md)', padding: 'var(--space-4)', marginBottom: 'var(--space-4)', display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
        <input
          type="search"
          placeholder="Search recipient, type, subject..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ padding: 'var(--space-2) var(--space-3)', border: '1px solid #ccc', borderRadius: 'var(--radius-sm)', fontSize: 'var(--text-sm)', minWidth: 240 }}
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={{ padding: 'var(--space-2) var(--space-3)', border: '1px solid #ccc', borderRadius: 'var(--radius-sm)', fontSize: 'var(--text-sm)' }}
        >
          <option value="">All statuses</option>
          {statuses.map((s) => <option key={s} value={s} style={{ textTransform: 'capitalize' }}>{s}</option>)}
        </select>
        <select
          value={channelFilter}
          onChange={(e) => setChannelFilter(e.target.value)}
          style={{ padding: 'var(--space-2) var(--space-3)', border: '1px solid #ccc', borderRadius: 'var(--radius-sm)', fontSize: 'var(--text-sm)' }}
        >
          <option value="">All channels</option>
          <option value="sms">📱 SMS</option>
          <option value="email">✉️ Email</option>
        </select>
        <button
          onClick={() => { setSearch(''); setStatusFilter(''); setChannelFilter(''); }}
          style={{ padding: 'var(--space-2) var(--space-3)', background: '#f0f0f0', border: '1px solid #ccc', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontSize: 'var(--text-sm)' }}
        >
          Clear
        </button>
      </div>

      {/* Table */}
      <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: 'var(--radius-md)', overflowX: 'auto', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-sm)' }}>
          <thead>
            <tr style={{ background: '#f8f9fa', borderBottom: '2px solid #e0e0e0' }}>
              {['Channel', 'Type', 'Recipient', 'Subject', 'Attempts', 'Status', 'Sent At', 'Error'].map((h) => (
                <th key={h} style={{ padding: 'var(--space-3) var(--space-4)', textAlign: 'left', fontWeight: 700, fontSize: 'var(--text-xs)', color: '#555', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ padding: 'var(--space-8)', textAlign: 'center', color: '#999' }}>
                  {error ? 'Notification data unavailable — see the info box above.' : 'No notifications found.'}
                </td>
              </tr>
            ) : filtered.map((notif, i) => {
              const sc = STATUS_COLORS[notif.status] ?? { bg: '#f0f0f0', text: '#333' };
              return (
                <tr key={notif.id} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa', borderBottom: '1px solid #f0f0f0' }}>
                  <td style={{ padding: 'var(--space-3) var(--space-4)', fontSize: '1.2rem', textAlign: 'center' }}>
                    {CHANNEL_ICON[notif.channel] ?? notif.channel}
                  </td>
                  <td style={{ padding: 'var(--space-3) var(--space-4)', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: '#555', whiteSpace: 'nowrap' }}>
                    {notif.type.replace(/_/g, ' ')}
                  </td>
                  <td style={{ padding: 'var(--space-3) var(--space-4)', fontSize: 'var(--text-xs)', color: '#333', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {notif.recipient}
                  </td>
                  <td style={{ padding: 'var(--space-3) var(--space-4)', fontSize: 'var(--text-xs)', color: '#555', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {notif.subject ?? '—'}
                  </td>
                  <td style={{ padding: 'var(--space-3) var(--space-4)', textAlign: 'center', fontWeight: 700, color: notif.attempts > 1 ? '#e65100' : '#333' }}>
                    {notif.attempts}
                  </td>
                  <td style={{ padding: 'var(--space-3) var(--space-4)' }}>
                    <span style={{ background: sc.bg, color: sc.text, fontSize: 'var(--text-xs)', fontWeight: 700, padding: '2px 10px', borderRadius: 999, textTransform: 'capitalize', whiteSpace: 'nowrap' }}>
                      {notif.status}
                    </span>
                  </td>
                  <td style={{ padding: 'var(--space-3) var(--space-4)', fontSize: 'var(--text-xs)', color: '#888', whiteSpace: 'nowrap' }}>
                    {notif.sent_at ? formatDateTime(notif.sent_at) : '—'}
                  </td>
                  <td style={{ padding: 'var(--space-3) var(--space-4)', fontSize: 'var(--text-xs)', color: '#b71c1c', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {notif.last_error ?? '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Architecture note */}
      {!error && notifications.length === 0 && (
        <div style={{ marginTop: 'var(--space-4)', fontSize: 'var(--text-xs)', color: '#888', textAlign: 'center' }}>
          Notifications appear here once order confirmations, shipping updates, or password resets are sent.
        </div>
      )}
    </div>
  );
}
