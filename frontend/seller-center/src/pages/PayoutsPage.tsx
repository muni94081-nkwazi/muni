import { useState } from 'react';
import { useFinance } from '@/hooks/useFinance';
import {
  MINIMUM_WITHDRAWAL_AMOUNT,
  type WithdrawalMethod,
  type WithdrawalStatus,
} from '@/types/finance.types';

const STATUS_COLOR: Record<WithdrawalStatus, string> = {
  pending: '#f59e0b',
  processing: '#3b82f6',
  completed: '#10b981',
  failed: '#ef4444',
  rejected: '#64748b',
};

const STATUS_LABEL: Record<WithdrawalStatus, string> = {
  pending: 'Awaiting approval',
  processing: 'Disbursing',
  completed: 'Paid',
  failed: 'Failed',
  rejected: 'Rejected',
};

const METHOD_LABEL: Record<string, string> = {
  mobile_money: 'Mobile Money',
  bank_transfer: 'Bank Transfer',
};

/** Mobile money networks payment-service can disburse through. */
const NETWORKS = [
  { value: 'MTN', label: 'MTN MoMo' },
  { value: 'AIRTEL', label: 'Airtel Money' },
];

function money(amount: number, currency: string): string {
  return `${currency} ${Math.round(amount).toLocaleString()}`;
}

export function PayoutsPage() {
  const { earnings, transactions, withdrawals, isLoading, isRequesting, error, requestWithdrawal, clearError } =
    useFinance();

  const [showRequestForm, setShowRequestForm] = useState(false);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<WithdrawalMethod>('mobile_money');
  const [network, setNetwork] = useState('MTN');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountName, setAccountName] = useState('');
  const [formError, setFormError] = useState('');

  const currency = earnings?.currency ?? 'UGX';
  const available = earnings?.availableBalance ?? 0;
  const requested = Number(amount);

  // Checked here as well as server-side so the seller sees why before the round
  // trip. payment-service enforces both again — this is convenience, not the guard.
  function validate(): string | null {
    if (!amount || Number.isNaN(requested) || requested <= 0) return 'Enter an amount to withdraw.';
    if (requested < MINIMUM_WITHDRAWAL_AMOUNT) {
      return `The minimum withdrawal is ${money(MINIMUM_WITHDRAWAL_AMOUNT, currency)}.`;
    }
    if (requested > available) {
      return `You can withdraw up to ${money(available, currency)} right now.`;
    }
    if (!accountNumber.trim()) return 'Enter the account to pay into.';
    return null;
  }

  async function handleRequest() {
    const problem = validate();
    if (problem) {
      setFormError(problem);
      return;
    }

    setFormError('');
    clearError();
    try {
      await requestWithdrawal({
        amount: requested,
        method,
        destinationAccount: {
          accountNumber: accountNumber.trim(),
          accountName: accountName.trim() || accountNumber.trim(),
          bankCode: method === 'mobile_money' ? network : undefined,
        },
      });
      setShowRequestForm(false);
      setAmount('');
      setAccountNumber('');
      setAccountName('');
    } catch (err) {
      setFormError(String(err));
    }
  }

  if (isLoading && !earnings) {
    return <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>Loading payouts…</div>;
  }

  const cards = [
    {
      label: 'Available to withdraw',
      value: money(available, currency),
      color: '#10b981',
      hint: 'Delivered orders, funds released',
    },
    {
      label: 'Pending clearance',
      value: money(earnings?.pendingBalance ?? 0, currency),
      color: '#f59e0b',
      hint: 'Paid for, awaiting delivery',
    },
    {
      label: 'In withdrawal',
      value: money(earnings?.reservedBalance ?? 0, currency),
      color: '#3b82f6',
      hint: 'Requested, awaiting approval',
    },
    {
      label: 'Lifetime earnings',
      value: money(earnings?.totalEarnings ?? 0, currency),
      color: '#0f172a',
      hint: `After ${money(earnings?.platformCommission ?? 0, currency)} commission`,
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700 }}>Payouts</h1>
        <button
          onClick={() => { setShowRequestForm(true); setFormError(''); clearError(); }}
          disabled={available < MINIMUM_WITHDRAWAL_AMOUNT}
          title={
            available < MINIMUM_WITHDRAWAL_AMOUNT
              ? `You need at least ${money(MINIMUM_WITHDRAWAL_AMOUNT, currency)} available`
              : undefined
          }
          style={{
            background: available < MINIMUM_WITHDRAWAL_AMOUNT ? '#cbd5e1' : '#3b82f6',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            padding: '10px 20px',
            fontWeight: 600,
            cursor: available < MINIMUM_WITHDRAWAL_AMOUNT ? 'not-allowed' : 'pointer',
          }}
        >
          Request Payout
        </button>
      </div>

      {error && !showRequestForm && (
        <div role="alert" style={{ background: '#fee2e2', border: '1px solid #fca5a5', color: '#991b1b', padding: '12px 16px', borderRadius: 8, marginBottom: 20, fontSize: 14 }}>
          {error}
        </div>
      )}

      {/* Balance breakdown */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
        {cards.map((c) => (
          <div key={c.label} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 20 }}>
            <p style={{ fontSize: 13, color: '#64748b', marginBottom: 8 }}>{c.label}</p>
            <p style={{ fontSize: 22, fontWeight: 800, color: c.color }}>{c.value}</p>
            <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 6 }}>{c.hint}</p>
          </div>
        ))}
      </div>

      {/* Request form */}
      {showRequestForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 32, width: 420, maxWidth: '90vw' }}>
            <h2 style={{ fontWeight: 700, marginBottom: 4 }}>Request Payout</h2>
            <p style={{ fontSize: 13, color: '#64748b', marginBottom: 20 }}>
              {money(available, currency)} available · minimum {money(MINIMUM_WITHDRAWAL_AMOUNT, currency)}
            </p>

            {(formError || error) && (
              <div role="alert" style={{ background: '#fee2e2', border: '1px solid #fca5a5', color: '#991b1b', padding: '10px 12px', borderRadius: 6, marginBottom: 16, fontSize: 13 }}>
                {formError || error}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Amount ({currency})</label>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  min={MINIMUM_WITHDRAWAL_AMOUNT}
                  max={available}
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 14, boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Method</label>
                <select
                  value={method}
                  onChange={(e) => setMethod(e.target.value as WithdrawalMethod)}
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 14 }}
                >
                  <option value="mobile_money">Mobile Money</option>
                  <option value="bank_transfer">Bank Transfer</option>
                </select>
              </div>

              {/* payment-service routes mobile money by bankCode ('MTN' | 'AIRTEL')
                  and refuses the request without a recognised one. */}
              {method === 'mobile_money' && (
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Network</label>
                  <select
                    value={network}
                    onChange={(e) => setNetwork(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 14 }}
                  >
                    {NETWORKS.map((n) => (
                      <option key={n.value} value={n.value}>{n.label}</option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
                  {method === 'mobile_money' ? 'Mobile money number' : 'Bank account number'}
                </label>
                <input
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value)}
                  placeholder={method === 'mobile_money' ? '+256 700 000000' : '0123456789'}
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 14, boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Account name</label>
                <input
                  value={accountName}
                  onChange={(e) => setAccountName(e.target.value)}
                  placeholder="Name registered on the account"
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 14, boxSizing: 'border-box' }}
                />
              </div>

              <p style={{ fontSize: 12, color: '#64748b', margin: 0 }}>
                The amount is held aside as soon as you submit. An admin reviews the request before it is paid out.
              </p>

              <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                <button
                  onClick={() => void handleRequest()}
                  disabled={isRequesting}
                  style={{ flex: 1, background: isRequesting ? '#94a3b8' : '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, padding: '10px 0', fontWeight: 600, cursor: isRequesting ? 'default' : 'pointer' }}
                >
                  {isRequesting ? 'Submitting…' : 'Submit request'}
                </button>
                <button
                  onClick={() => { setShowRequestForm(false); setFormError(''); clearError(); }}
                  style={{ flex: 1, background: 'none', border: '1px solid #e2e8f0', borderRadius: 6, padding: '10px 0', cursor: 'pointer' }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Withdrawal history */}
      <div style={{ background: '#fff', borderRadius: 8, border: '1px solid #e2e8f0', overflow: 'hidden', marginBottom: 24 }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', fontWeight: 700 }}>Withdrawal History</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ background: '#f8fafc' }}>
              <tr>
                {['Reference', 'Requested', 'Method', `Amount (${currency})`, 'Status'].map((h) => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {withdrawals.map((w, i) => (
                <tr key={w.id} style={{ borderTop: i > 0 ? '1px solid #e2e8f0' : 'none' }}>
                  <td style={{ padding: '12px 16px', fontSize: 13, fontFamily: 'monospace' }}>{w.reference}</td>
                  <td style={{ padding: '12px 16px', fontSize: 13 }}>{new Date(w.createdAt).toLocaleDateString()}</td>
                  <td style={{ padding: '12px 16px', fontSize: 13 }}>
                    {METHOD_LABEL[w.method] ?? w.method}
                    {w.destinationAccount.bankCode ? ` · ${w.destinationAccount.bankCode}` : ''}
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 700 }}>{Math.round(w.amount).toLocaleString()}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{ background: `${STATUS_COLOR[w.status]}20`, color: STATUS_COLOR[w.status], padding: '2px 10px', borderRadius: 12, fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}>
                      {STATUS_LABEL[w.status]}
                    </span>
                    {/* The admin's reason, so a rejection is never unexplained. */}
                    {(w.rejectionReason || w.failureReason) && (
                      <div style={{ fontSize: 11, color: '#991b1b', marginTop: 4 }}>
                        {w.rejectionReason || w.failureReason}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {withdrawals.length === 0 && <p style={{ textAlign: 'center', padding: 32, color: '#64748b' }}>No withdrawals yet.</p>}
      </div>

      {/* Statement */}
      <div style={{ background: '#fff', borderRadius: 8, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', fontWeight: 700 }}>Statement</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ background: '#f8fafc' }}>
              <tr>
                {['Date', 'Description', 'Gross', 'Commission', `Net (${currency})`, 'Status'].map((h) => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {transactions.map((t, i) => (
                <tr key={t.id} style={{ borderTop: i > 0 ? '1px solid #e2e8f0' : 'none' }}>
                  <td style={{ padding: '12px 16px', fontSize: 13 }}>{new Date(t.createdAt).toLocaleDateString()}</td>
                  <td style={{ padding: '12px 16px', fontSize: 13 }}>
                    {t.type === 'credit' ? 'Order credit' : 'Withdrawal'}
                    <span style={{ color: '#94a3b8', marginLeft: 8, fontFamily: 'monospace', fontSize: 12 }}>{t.reference}</span>
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: 13 }}>
                    {t.type === 'credit' ? Math.round(t.grossAmount).toLocaleString() : '—'}
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: 13, color: '#b45309' }}>
                    {t.type === 'credit' ? `−${Math.round(t.platformFee).toLocaleString()}` : '—'}
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 700, color: t.amount < 0 ? '#ef4444' : '#10b981' }}>
                    {t.amount < 0 ? '−' : ''}{Math.round(Math.abs(t.amount)).toLocaleString()}
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: 12, color: '#64748b' }}>{t.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {transactions.length === 0 && (
          <p style={{ textAlign: 'center', padding: 32, color: '#64748b' }}>
            No transactions yet. Order credits appear here once a buyer pays.
          </p>
        )}
      </div>
    </div>
  );
}
