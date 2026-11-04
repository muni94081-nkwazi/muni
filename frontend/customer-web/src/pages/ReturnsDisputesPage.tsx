import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import {
  returnsApi,
  RETURN_REASONS,
  type ReturnRequest,
  type ReturnStatus,
} from '@/api/returns.api';

// ─── Returns ──────────────────────────────────────────────────────────────────
//
// This page was a fixture: it seeded a fake return "RET-4921" for a "Smart
// Fitness Watch Series 5" with an invented UGX 180,000 refund and a dead label
// URL, and its create form asked the customer to type the refund amount they
// wanted. return-service was live the whole time and nothing on the website
// called it.
//
// It now reads and writes the real service. Two things it deliberately does not
// do:
//
//   • It does not send a refund amount. ReturnRequestSchema has no such field,
//     and what a return is worth is not the customer's to propose.
//   • It does not tell a customer their reason will be approved automatically.
//     return-service has an auto-approve list, but createReturn tests it against
//     a field the request schema does not define, so it never fires — verified
//     against the running service.
//   • It does not offer actions the state machine forbids. return-service lets
//     a customer cancel only from REQUESTED; APPROVED, REJECTED, REFUNDED and
//     CANCELLED are terminal from the customer's side, so no button is drawn.
//
// Disputes are not surfaced here. dispute-service exposes customer endpoints,
// but wiring them is new functionality rather than connecting this page, and
// its routes carry no authorisation guards yet — see the accompanying report.

const STATUS_STYLE: Record<ReturnStatus, { bg: string; fg: string; label: string }> = {
  REQUESTED: { bg: '#fef3c7', fg: '#92400e', label: 'Awaiting review' },
  APPROVED:  { bg: '#dbeafe', fg: '#1e40af', label: 'Approved' },
  REJECTED:  { bg: '#fee2e2', fg: '#991b1b', label: 'Not approved' },
  REFUNDED:  { bg: '#dcfce7', fg: '#166534', label: 'Refunded' },
  CANCELLED: { bg: '#e5e7eb', fg: '#374151', label: 'Cancelled' },
};

const panel: React.CSSProperties = {
  textAlign: 'center',
  padding: 'var(--space-12)',
  background: 'var(--color-surface)',
  borderRadius: 'var(--radius-lg)',
  border: '1px solid var(--color-border)',
};

const readable = (reason: string) =>
  reason.replace(/_/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase());

function statusOf(err: unknown): number | undefined {
  const e = err as { status?: number; response?: { status?: number } };
  return e.status ?? e.response?.status;
}

export function ReturnsDisputesPage() {
  const { isAuthenticated } = useAuth();

  const [requests, setRequests] = useState<ReturnRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<'history' | 'create'>('history');
  const [orderId, setOrderId] = useState('');
  const [sellerId, setSellerId] = useState('');
  const [orderItemId, setOrderItemId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [reason, setReason] = useState<string>(RETURN_REASONS[0]);
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const flash = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(null), 4000);
  };

  const load = useCallback(async () => {
    if (!isAuthenticated) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      setRequests(await returnsApi.list());
    } catch (err) {
      setError(
        statusOf(err) === 401
          ? 'Your session has expired. Please sign in again to see your returns.'
          : 'We could not load your returns just now. Please try again.',
      );
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => { void load(); }, [load]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    setFormError(null);
    if (!orderId.trim() || !sellerId.trim() || !orderItemId.trim()) {
      setFormError('Order, seller and item references are all required.');
      return;
    }
    const qty = Number(quantity);
    if (!Number.isInteger(qty) || qty < 1) {
      setFormError('Quantity must be a whole number of at least 1.');
      return;
    }

    setSubmitting(true);
    try {
      const created = await returnsApi.create({
        orderId: orderId.trim(),
        sellerId: sellerId.trim(),
        items: [{ orderItemId: orderItemId.trim(), quantity: qty, reason }],
        description: description.trim() || undefined,
        refundMethod: 'ORIGINAL_PAYMENT_METHOD',
      });

      // Rendered from what the server returned, not from what was typed.
      setRequests((prev) => [created, ...prev]);
      setOrderId(''); setSellerId(''); setOrderItemId(''); setQuantity('1'); setDescription('');
      setActiveTab('history');
      flash(`Return request submitted. Status: ${STATUS_STYLE[created.status]?.label ?? created.status}.`);
    } catch (err) {
      const code = statusOf(err);
      if (code === 401) setFormError('Your session has expired. Please sign in again.');
      else if (code === 403) setFormError('This account is not allowed to return that order.');
      else if (code === 404) setFormError('That order or item could not be found on your account.');
      else if (code === 422 || code === 400) setFormError('Please check the order, item and quantity details.');
      else setFormError('We could not submit that return. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const cancel = async (req: ReturnRequest) => {
    if (busyId) return;
    setBusyId(req.id);
    try {
      const updated = await returnsApi.cancel(req.id);
      setRequests((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      flash('Return cancelled.');
    } catch (err) {
      const code = statusOf(err);
      setError(
        code === 409
          ? 'That return can no longer be cancelled — it has already been reviewed.'
          : code === 401
            ? 'Your session has expired. Please sign in again.'
            : 'That return could not be cancelled. Please try again.',
      );
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div style={{ paddingBottom: 'var(--space-8)' }}>
      <div style={{ marginBottom: 'var(--space-6)' }}>
        <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 800, color: 'var(--color-text-primary)' }}>
          Returns
        </h1>
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', marginTop: 'var(--space-1)' }}>
          Request a return and follow its progress. Returns are covered by MUNI’s 14-day guarantee.
        </p>
      </div>

      {notice && (
        <div style={{ background: '#dcfce7', border: '1px solid #86efac', color: '#166534', padding: '12px 16px', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-4)', fontSize: 'var(--text-sm)' }}>
          ✓ {notice}
        </div>
      )}

      {!isAuthenticated ? (
        <div style={panel}>
          <h3 style={{ fontSize: 'var(--text-lg)', marginBottom: 'var(--space-2)' }}>Sign in to manage returns</h3>
          <p style={{ color: 'var(--color-text-secondary)', marginBottom: 'var(--space-4)' }}>
            Returns are tied to your MUNI account and the orders on it.
          </p>
          <Link to="/login" style={{ padding: '10px 24px', background: 'var(--color-primary)', color: '#fff', borderRadius: 'var(--radius-md)', textDecoration: 'none', fontWeight: 600 }}>
            Sign in
          </Link>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-5)' }}>
            {(['history', 'create'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  padding: '8px 18px', borderRadius: 'var(--radius-md)', fontWeight: 600, fontSize: 'var(--text-sm)',
                  cursor: 'pointer',
                  border: activeTab === tab ? 'none' : '1px solid var(--color-border)',
                  background: activeTab === tab ? 'var(--color-primary)' : 'transparent',
                  color: activeTab === tab ? '#fff' : 'var(--color-text-secondary)',
                }}
              >
                {tab === 'history' ? 'My returns' : 'Request a return'}
              </button>
            ))}
          </div>

          {activeTab === 'history' && (
            loading ? (
              <div style={panel}><p style={{ color: 'var(--color-text-secondary)' }}>Loading your returns…</p></div>
            ) : error ? (
              <div style={panel}>
                <h3 style={{ fontSize: 'var(--text-lg)', marginBottom: 'var(--space-2)' }}>We hit a problem</h3>
                <p role="alert" style={{ color: 'var(--color-text-secondary)', marginBottom: 'var(--space-4)' }}>{error}</p>
                <button onClick={() => void load()} style={{ padding: '10px 24px', background: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 'var(--radius-md)', fontWeight: 600, cursor: 'pointer' }}>
                  Try again
                </button>
              </div>
            ) : requests.length === 0 ? (
              <div style={panel}>
                <h3 style={{ fontSize: 'var(--text-lg)', marginBottom: 'var(--space-2)' }}>No returns yet</h3>
                <p style={{ color: 'var(--color-text-secondary)', marginBottom: 'var(--space-4)' }}>
                  When you request a return it will appear here with its progress.
                </p>
                <Link to="/orders" style={{ padding: '10px 24px', background: 'var(--color-primary)', color: '#fff', borderRadius: 'var(--radius-md)', textDecoration: 'none', fontWeight: 600 }}>
                  View my orders
                </Link>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                {requests.map((req) => {
                  const style = STATUS_STYLE[req.status] ?? { bg: '#e5e7eb', fg: '#374151', label: req.status };
                  const when = req.requestedAt ?? req.createdAt;
                  return (
                    <div key={req.id} style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-4)' }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-3)', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: 'var(--text-sm)' }}>Order {req.orderId}</div>
                          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', marginTop: 2 }}>
                            {req.items.length} {req.items.length === 1 ? 'item' : 'items'}
                            {when && ` · requested ${new Date(when).toLocaleDateString()}`}
                          </div>
                        </div>
                        <span style={{ background: style.bg, color: style.fg, padding: '4px 12px', borderRadius: '20px', fontSize: 'var(--text-xs)', fontWeight: 700 }}>
                          {style.label}
                        </span>
                      </div>

                      <ul style={{ margin: 'var(--space-3) 0 0', paddingLeft: 18, fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
                        {req.items.map((item, i) => (
                          <li key={`${req.id}-${item.orderItemId}-${i}`}>
                            {item.quantity} × item {item.orderItemId} — {readable(item.reason)}
                          </li>
                        ))}
                      </ul>

                      {req.description && (
                        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', marginTop: 'var(--space-2)' }}>
                          “{req.description}”
                        </p>
                      )}

                      {/* Shown only when the backend actually recorded one — the
                          old page printed an invented figure on every row. */}
                      {typeof req.refundAmount === 'number' && (
                        <p style={{ fontSize: 'var(--text-sm)', fontWeight: 700, marginTop: 'var(--space-2)' }}>
                          Refund: {req.refundAmount.toLocaleString()} {req.currency ?? ''}
                        </p>
                      )}

                      {/* The only customer transition the service permits. */}
                      {req.status === 'REQUESTED' && (
                        <button
                          onClick={() => void cancel(req)}
                          disabled={busyId === req.id}
                          style={{ marginTop: 'var(--space-3)', padding: '8px 16px', background: 'transparent', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', cursor: busyId === req.id ? 'default' : 'pointer' }}
                        >
                          {busyId === req.id ? 'Cancelling…' : 'Cancel this return'}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )
          )}

          {activeTab === 'create' && (
            <form onSubmit={submit} noValidate style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-5)', maxWidth: 560 }}>
              <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-4)' }}>
                You can find the order, seller and item references on the order in your account.
              </p>

              {([
                ['Order reference', orderId, setOrderId],
                ['Seller reference', sellerId, setSellerId],
                ['Order item reference', orderItemId, setOrderItemId],
              ] as const).map(([label, value, setter]) => (
                <label key={label} style={{ display: 'block', marginBottom: 'var(--space-3)' }}>
                  <span style={{ display: 'block', fontSize: 'var(--text-sm)', fontWeight: 600, marginBottom: 4 }}>{label} *</span>
                  <input
                    value={value} onChange={(e) => setter(e.target.value)} required
                    style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)' }}
                  />
                </label>
              ))}

              <label style={{ display: 'block', marginBottom: 'var(--space-3)' }}>
                <span style={{ display: 'block', fontSize: 'var(--text-sm)', fontWeight: 600, marginBottom: 4 }}>Quantity *</span>
                <input
                  type="number" min={1} value={quantity} onChange={(e) => setQuantity(e.target.value)} required
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)' }}
                />
              </label>

              <label style={{ display: 'block', marginBottom: 'var(--space-3)' }}>
                <span style={{ display: 'block', fontSize: 'var(--text-sm)', fontWeight: 600, marginBottom: 4 }}>Reason *</span>
                <select
                  value={reason} onChange={(e) => setReason(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)' }}
                >
                  {RETURN_REASONS.map((r) => (
                    <option key={r} value={r}>{readable(r)}</option>
                  ))}
                </select>
              </label>

              <label style={{ display: 'block', marginBottom: 'var(--space-4)' }}>
                <span style={{ display: 'block', fontSize: 'var(--text-sm)', fontWeight: 600, marginBottom: 4 }}>Anything else? (optional)</span>
                <textarea
                  value={description} onChange={(e) => setDescription(e.target.value)} rows={3}
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', fontFamily: 'inherit' }}
                />
              </label>

              {/* No refund-amount field: what a return is worth is decided by
                  MUNI and the seller, and the API accepts no such value. */}
              <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-4)' }}>
                Any refund is worked out from your order once the return is reviewed.
              </p>

              {formError && (
                <p role="alert" style={{ color: '#c53030', fontSize: 'var(--text-sm)', marginBottom: 'var(--space-3)' }}>{formError}</p>
              )}

              <button
                type="submit" disabled={submitting}
                style={{ padding: '10px 24px', background: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 'var(--radius-md)', fontWeight: 700, cursor: submitting ? 'default' : 'pointer' }}
              >
                {submitting ? 'Submitting…' : 'Submit return request'}
              </button>
            </form>
          )}
        </>
      )}
    </div>
  );
}
