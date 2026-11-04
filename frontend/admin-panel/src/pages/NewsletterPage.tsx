import { useCallback, useEffect, useState } from 'react';
import { Table } from '../components/common/Table/Table';
import { Badge } from '../components/common/Badge/Badge';
import {
  newsletterApi,
  SUBSCRIPTION_STATUSES,
  type Subscriber,
  type SubscriberPage,
  type SubscriptionStatus,
} from '../api/newsletter.api';

const PAGE_SIZE = 50;

// Server-side status → the Badge variants the rest of the panel already uses.
const STATUS_VARIANT: Record<SubscriptionStatus, string> = {
  PENDING: 'under_review',
  CONFIRMED: 'resolved',
  UNSUBSCRIBED: 'closed',
};

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function NewsletterPage() {
  const [data, setData] = useState<SubscriberPage | null>(null);
  const [status, setStatus] = useState<SubscriptionStatus | 'ALL'>('ALL');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await newsletterApi.list({
        ...(status === 'ALL' ? {} : { status }),
        page,
        limit: PAGE_SIZE,
      });
      setData(result);
    } catch (err) {
      // Surfaced, not swallowed into a fixture — see the note in newsletter.api.ts.
      setError(err instanceof Error ? err.message : 'Could not load subscribers');
    } finally {
      setLoading(false);
    }
  }, [status, page]);

  useEffect(() => {
    void load();
  }, [load]);

  // Filtering resets to page 1: staying on page 4 of a filter that now has one
  // page renders an empty table that looks like "no subscribers".
  function changeStatus(next: SubscriptionStatus | 'ALL') {
    setStatus(next);
    setPage(1);
  }

  const counts = data?.countsByStatus;
  const allCount = counts
    ? counts.PENDING + counts.CONFIRMED + counts.UNSUBSCRIBED
    : 0;

  const columns = [
    { key: 'email', label: 'Email' },
    {
      key: 'status',
      label: 'Status',
      render: (s: Subscriber) => (
        <Badge variant={STATUS_VARIANT[s.status]}>{s.status.toLowerCase()}</Badge>
      ),
    },
    { key: 'source', label: 'Source' },
    { key: 'market', label: 'Market' },
    {
      key: 'consentAt',
      label: 'Consented',
      render: (s: Subscriber) => formatDate(s.consentAt),
      sortAccessor: (s: Subscriber) => s.consentAt ?? '',
    },
    {
      key: 'confirmedAt',
      label: 'Confirmed',
      render: (s: Subscriber) => formatDate(s.confirmedAt),
      sortAccessor: (s: Subscriber) => s.confirmedAt ?? '',
    },
    {
      key: 'createdAt',
      label: 'Signed up',
      render: (s: Subscriber) => formatDate(s.createdAt),
      sortAccessor: (s: Subscriber) => s.createdAt,
    },
  ];

  const tabs: Array<{ key: SubscriptionStatus | 'ALL'; label: string; count: number }> = [
    { key: 'ALL', label: 'All', count: allCount },
    ...SUBSCRIPTION_STATUSES.map((s) => ({
      key: s,
      label: s.charAt(0) + s.slice(1).toLowerCase(),
      count: counts?.[s] ?? 0,
    })),
  ];

  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>Newsletter Subscribers</h1>
      <p style={{ color: 'var(--color-text-muted, #666)', marginBottom: 20 }}>
        {data
          ? `${data.total.toLocaleString()} ${status === 'ALL' ? 'total' : status.toLowerCase()} · showing page ${data.page} of ${data.totalPages}`
          : 'Loading…'}
      </p>

      {/* Status tabs. Counts come from the server and are unaffected by the
          active filter, so switching tabs never changes the numbers on them. */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {tabs.map((tab) => {
          const active = status === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => changeStatus(tab.key)}
              style={{
                padding: '8px 14px',
                borderRadius: 6,
                cursor: 'pointer',
                border: `1px solid ${active ? 'var(--color-primary, #2563eb)' : 'var(--color-border, #ddd)'}`,
                background: active ? 'var(--color-primary, #2563eb)' : 'transparent',
                color: active ? '#fff' : 'inherit',
                fontWeight: active ? 600 : 400,
              }}
            >
              {tab.label} ({tab.count.toLocaleString()})
            </button>
          );
        })}
      </div>

      {error && (
        <div
          role="alert"
          style={{
            padding: 16,
            marginBottom: 16,
            borderRadius: 6,
            border: '1px solid #f5c2c7',
            background: '#f8d7da',
            color: '#842029',
          }}
        >
          <strong>Could not load subscribers.</strong> {error}{' '}
          <button onClick={() => void load()} style={{ marginLeft: 8, cursor: 'pointer' }}>
            Retry
          </button>
        </div>
      )}

      <Table
        columns={columns}
        data={data?.subscribers ?? []}
        searchable
        searchPlaceholder="Search the current page by email, source, market…"
        sortable
        getRowId={(s: Subscriber) => s.id}
        emptyMessage={
          loading
            ? 'Loading subscribers…'
            : error
              ? 'No data — the request failed.'
              : 'No subscribers match this filter.'
        }
      />

      {/* Server-side paging. The Table's own pageSize is deliberately unset:
          it would paginate the 50 rows we already hold and disagree with the
          server's page count. */}
      {data && data.totalPages > 1 && (
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 16 }}>
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={loading || data.page <= 1}
            style={{ padding: '6px 12px', cursor: data.page <= 1 ? 'default' : 'pointer' }}
          >
            ← Previous
          </button>
          <span>
            Page {data.page} of {data.totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
            disabled={loading || data.page >= data.totalPages}
            style={{ padding: '6px 12px', cursor: data.page >= data.totalPages ? 'default' : 'pointer' }}
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}

export default NewsletterPage;
