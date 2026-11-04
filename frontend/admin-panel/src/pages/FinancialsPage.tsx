import { useState } from 'react';
import { useFinance } from '@/hooks/useFinance';
import { useDashboard } from '@/hooks/useDashboard';
import { Spinner } from '@/components/common/Spinner/Spinner';
import { EmptyState } from '@/components/common/EmptyState';
import { EscrowReconciliationDashboard } from '@/components/finance/EscrowReconciliationDashboard';
import type { Withdrawal, WithdrawalStatus } from '@/types/payout.types';

const STATUS_STYLE: Record<WithdrawalStatus, { bg: string; fg: string; label: string }> = {
  pending:    { bg: '#fef3c7', fg: '#92400e', label: 'Awaiting review' },
  processing: { bg: '#dbeafe', fg: '#1e40af', label: 'Disbursing' },
  completed:  { bg: '#dcfce7', fg: '#15803d', label: 'Disbursed' },
  failed:     { bg: '#fee2e2', fg: '#991b1b', label: 'Provider failed' },
  rejected:   { bg: '#f1f5f9', fg: '#475569', label: 'Rejected' },
};

const METHOD_LABEL: Record<string, string> = {
  mobile_money: 'Mobile Money',
  bank_transfer: 'Bank Transfer',
};

const FILTERS: Array<{ value: WithdrawalStatus | undefined; label: string }> = [
  { value: 'pending', label: 'Awaiting review' },
  { value: 'processing', label: 'Disbursing' },
  { value: 'completed', label: 'Disbursed' },
  { value: 'rejected', label: 'Rejected' },
  { value: undefined, label: 'All' },
];

function money(amount: number, currency: string): string {
  return `${currency} ${Math.round(amount).toLocaleString()}`;
}

function KpiCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ background: 'var(--color-surface)', padding: '20px', borderRadius: '12px', border: '1px solid var(--color-border)' }}>
      <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: '20px', fontWeight: 800, color, marginTop: '4px' }}>{value}</div>
    </div>
  );
}

export function FinancialsPage() {
  const [statusFilter, setStatusFilter] = useState<WithdrawalStatus | undefined>('pending');
  const { summary, withdrawals, isLoading, actioningId, error, loadAll, approve, reject } =
    useFinance({ status: statusFilter });

  // GMV is order-service's number, served by the dashboard stats fan-out.
  // Sourcing it from payment-service too would produce two figures that drift.
  const { stats } = useDashboard({ includeFeeds: false });

  const [notification, setNotification] = useState('');
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [actionError, setActionError] = useState('');

  const currency = summary?.currency ?? 'UGX';

  function announce(message: string) {
    setNotification(message);
    setTimeout(() => setNotification(''), 4000);
  }

  async function handleApprove(withdrawal: Withdrawal) {
    setActionError('');
    try {
      const updated = await approve(withdrawal.id);
      // payment-service calls the provider inline, so the row can come back
      // already failed — reporting "disbursed" regardless would be a lie.
      announce(
        updated.status === 'completed'
          ? `${updated.reference} disbursed — ${money(updated.amount, updated.currency)}`
          : `${updated.reference} is ${updated.status}${updated.failureReason ? `: ${updated.failureReason}` : ''}`,
      );
      loadAll();
    } catch (err) {
      setActionError(String(err));
    }
  }

  async function handleReject() {
    if (!rejectingId || !rejectReason.trim()) return;
    setActionError('');
    try {
      const updated = await reject(rejectingId, rejectReason.trim());
      announce(`${updated.reference} rejected — funds returned to the seller's balance`);
      setRejectingId(null);
      setRejectReason('');
      loadAll();
    } catch (err) {
      setActionError(String(err));
    }
  }

  return (
    <div style={{ padding: 'var(--space-6)' }}>
      <div style={{ marginBottom: 'var(--space-6)' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 800 }}>Platform Financials &amp; Settlement Center</h1>
        <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
          GMV, escrow reserves, platform commission and the seller withdrawal queue
        </p>
      </div>

      {notification && (
        <div style={{ background: '#dcfce7', border: '1px solid #86efac', color: '#166534', padding: '12px 16px', borderRadius: '8px', marginBottom: '20px', fontSize: '14px', fontWeight: 600 }}>
          ✓ {notification}
        </div>
      )}

      {(error || actionError) && (
        <div role="alert" style={{ background: '#fee2e2', border: '1px solid #fca5a5', color: '#991b1b', padding: '12px 16px', borderRadius: '8px', marginBottom: '20px', fontSize: '14px' }}>
          {actionError || error}
        </div>
      )}

      {/* KPI Overview */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '32px' }}>
        <KpiCard
          label="Gross Merchandise Value"
          value={stats ? money(stats.gmv, stats.currency) : '—'}
          color="var(--color-text-primary)"
        />
        <KpiCard
          label="Platform Commission Earned"
          value={summary ? money(summary.platformCommissionEarned, currency) : '—'}
          color="#16a34a"
        />
        <KpiCard
          label="Active Escrow Reserve"
          value={summary ? money(summary.escrow.activeEscrowHoldUGX, currency) : '—'}
          color="#0284c7"
        />
        <KpiCard
          label="Total Disbursed Payouts"
          value={summary ? money(summary.totalPayoutsDisbursed, currency) : '—'}
          color="var(--color-text-secondary)"
        />
        <KpiCard
          label="Committed to Withdrawals"
          value={summary ? money(summary.pendingWithdrawalValue, currency) : '—'}
          color="#b45309"
        />
      </div>

      <div style={{ marginBottom: '32px' }}>
        <EscrowReconciliationDashboard
          escrow={summary?.escrow ?? null}
          currency={currency}
          isLoading={isLoading}
        />
      </div>

      {/* Withdrawal queue */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: 12 }}>
        <h2 style={{ fontSize: '18px', fontWeight: 800, margin: 0 }}>Seller Withdrawal &amp; Payout Queue</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          {FILTERS.map((filter) => (
            <button
              key={filter.label}
              onClick={() => setStatusFilter(filter.value)}
              style={{
                padding: '6px 14px',
                borderRadius: '999px',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
                border: '1px solid var(--color-border)',
                background: statusFilter === filter.value ? 'var(--color-accent)' : 'transparent',
                color: statusFilter === filter.value ? '#fff' : 'var(--color-text-secondary)',
              }}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading && withdrawals.length === 0 ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
          <Spinner />
        </div>
      ) : withdrawals.length === 0 ? (
        <EmptyState
          icon="💸"
          title="No withdrawal requests"
          description="Requests appear here as sellers withdraw against their cleared balance."
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {withdrawals.map((w) => {
            const style = STATUS_STYLE[w.status];
            const busy = actioningId === w.id;

            return (
              <div
                key={w.id}
                style={{
                  background: 'var(--color-surface)',
                  padding: '16px 20px',
                  borderRadius: '10px',
                  border: '1px solid var(--color-border)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 16,
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ minWidth: 260 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontWeight: 800, fontSize: '14px' }}>
                      {w.destinationAccount.accountName || w.vendorId}
                    </span>
                    <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)', fontFamily: 'monospace' }}>
                      {w.reference}
                    </span>
                  </div>
                  <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
                    {METHOD_LABEL[w.method] ?? w.method}
                    {w.destinationAccount.bankCode ? ` (${w.destinationAccount.bankCode})` : ''}
                    {' · '}
                    {w.destinationAccount.accountNumber}
                    {' · Requested '}
                    {new Date(w.createdAt).toLocaleDateString()}
                  </p>
                  {w.rejectionReason && (
                    <p style={{ fontSize: '12px', color: '#991b1b', marginTop: '4px' }}>
                      Rejected: {w.rejectionReason}
                    </p>
                  )}
                  {w.failureReason && (
                    <p style={{ fontSize: '12px', color: '#991b1b', marginTop: '4px' }}>
                      Provider: {w.failureReason}
                    </p>
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '16px', fontWeight: 800, color: 'var(--color-text-primary)' }}>
                    {money(w.amount, w.currency)}
                  </span>

                  <span style={{ background: style.bg, color: style.fg, padding: '4px 12px', borderRadius: '12px', fontSize: '12px', fontWeight: 700 }}>
                    {style.label}
                  </span>

                  {w.status === 'pending' && (
                    <>
                      <button
                        onClick={() => void handleApprove(w)}
                        disabled={busy}
                        style={{
                          padding: '8px 16px',
                          background: busy ? '#94a3b8' : '#16a34a',
                          color: '#ffffff',
                          border: 'none',
                          borderRadius: '6px',
                          fontSize: '12px',
                          fontWeight: 700,
                          cursor: busy ? 'default' : 'pointer',
                        }}
                      >
                        {busy ? 'Processing…' : '✓ Authorize & Disburse'}
                      </button>
                      <button
                        onClick={() => { setRejectingId(w.id); setRejectReason(''); }}
                        disabled={busy}
                        style={{
                          padding: '8px 16px',
                          background: 'transparent',
                          color: '#991b1b',
                          border: '1px solid #fca5a5',
                          borderRadius: '6px',
                          fontSize: '12px',
                          fontWeight: 700,
                          cursor: busy ? 'default' : 'pointer',
                        }}
                      >
                        Reject
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Reject dialog — payment-service requires a reason, and it is shown to
          the seller verbatim, so there is no way to reject without one. */}
      {rejectingId && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--color-surface)', borderRadius: 12, padding: 32, width: 420, maxWidth: '90vw' }}>
            <h2 style={{ fontWeight: 700, marginBottom: 8 }}>Reject withdrawal</h2>
            <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 16 }}>
              The reserved amount returns to the seller's available balance. This reason is shown to them.
            </p>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={3}
              placeholder="e.g. Payout account name does not match the registered business"
              style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--color-border)', borderRadius: 6, fontSize: 14, boxSizing: 'border-box', fontFamily: 'inherit' }}
            />
            <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
              <button
                onClick={() => void handleReject()}
                disabled={!rejectReason.trim() || actioningId === rejectingId}
                style={{
                  flex: 1,
                  background: rejectReason.trim() ? '#dc2626' : '#cbd5e1',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 6,
                  padding: '10px 0',
                  fontWeight: 600,
                  cursor: rejectReason.trim() ? 'pointer' : 'default',
                }}
              >
                {actioningId === rejectingId ? 'Rejecting…' : 'Confirm rejection'}
              </button>
              <button
                onClick={() => setRejectingId(null)}
                style={{ flex: 1, background: 'none', border: '1px solid var(--color-border)', borderRadius: 6, padding: '10px 0', cursor: 'pointer' }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default FinancialsPage;
