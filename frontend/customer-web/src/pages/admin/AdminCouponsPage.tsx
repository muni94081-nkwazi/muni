import { useEffect, useState, type FormEvent } from 'react';
import { apiClient } from '@/api/axios.config';
import { formatDate, formatMoney } from '@/utils/formatters';
import { LoadingState } from '@/components/common/LoadingState';
import { logger } from '@/utils/logger';

interface Coupon {
  id: string;
  code: string;
  description: string | null;
  discount_type: 'percentage' | 'fixed_amount' | 'free_shipping';
  discount_value: number;
  min_spend: number | null;
  max_discount_amount: number | null;
  currency: string;
  usage_limit: number | null;
  usage_limit_per_user: number | null;
  starts_at: string | null;
  expires_at: string | null;
  is_active: boolean;
  is_expired: boolean;
  first_order_only: boolean;
  created_at: string;
}

const DISCOUNT_TYPE_LABELS = {
  percentage: 'Percentage',
  fixed_amount: 'Fixed Amount',
  free_shipping: 'Free Shipping',
};

export function AdminCouponsPage() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [discountType, setDiscountType] = useState<Coupon['discount_type']>('percentage');
  const [discountValue, setDiscountValue] = useState('');
  const [minSpend, setMinSpend] = useState('');
  const [maxDiscount, setMaxDiscount] = useState('');
  const [usageLimit, setUsageLimit] = useState('');
  const [perUserLimit, setPerUserLimit] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [firstOrderOnly, setFirstOrderOnly] = useState(false);

  function loadCoupons() {
    setIsLoading(true);
    apiClient.get<{ data: Coupon[] }>('/coupons')
      .then((res) => setCoupons(Array.isArray(res.data.data) ? res.data.data : []))
      .catch((err) => logger.error('[AdminCouponsPage] Failed to load coupons:', err))
      .finally(() => setIsLoading(false));
  }

  useEffect(() => { loadCoupons(); }, []);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setCreating(true);
    try {
      await apiClient.post('/coupons', {
        code: code.toUpperCase().trim(),
        description: description || undefined,
        discount_type: discountType,
        discount_value: parseFloat(discountValue),
        min_spend: minSpend ? parseFloat(minSpend) : undefined,
        max_discount_amount: maxDiscount ? parseFloat(maxDiscount) : undefined,
        usage_limit: usageLimit ? parseInt(usageLimit) : undefined,
        usage_limit_per_user: perUserLimit ? parseInt(perUserLimit) : undefined,
        expires_at: expiresAt || undefined,
        first_order_only: firstOrderOnly,
        is_active: true,
      });
      setShowForm(false);
      setCode(''); setDescription(''); setDiscountValue(''); setMinSpend('');
      setMaxDiscount(''); setUsageLimit(''); setPerUserLimit(''); setExpiresAt('');
      setFirstOrderOnly(false);
      loadCoupons();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create coupon';
      setFormError(msg);
    } finally {
      setCreating(false);
    }
  }

  async function handleToggle(coupon: Coupon) {
    try {
      await apiClient.patch(`/coupons/${coupon.id}`, { is_active: !coupon.is_active });
      loadCoupons();
    } catch (err) {
      logger.error('[AdminCouponsPage] Failed to toggle coupon:', err);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm('Delete this coupon?')) return;
    try {
      await apiClient.delete(`/coupons/${id}`);
      loadCoupons();
    } catch (err) {
      logger.error('[AdminCouponsPage] Failed to delete coupon:', err);
    }
  }

  if (isLoading) return <LoadingState label="Loading coupons..." />;

  const inputStyle = { padding: 'var(--space-2) var(--space-3)', border: '1px solid #ccc', borderRadius: 'var(--radius-sm)', fontSize: 'var(--text-sm)', width: '100%' };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-5)' }}>
        <div>
          <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 700 }}>Coupon Management</h1>
          <p style={{ color: '#666', fontSize: 'var(--text-sm)' }}>{coupons.length} active coupons</p>
        </div>
        <button
          onClick={() => setShowForm((s) => !s)}
          style={{ background: 'linear-gradient(to bottom, #f7dfa5, #f0c14b)', border: '1px solid #a88734', color: '#111', fontWeight: 700, padding: 'var(--space-2) var(--space-4)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontSize: 'var(--text-sm)' }}
        >
          {showForm ? '✕ Cancel' : '+ Create Coupon'}
        </button>
      </div>

      {/* Create Form */}
      {showForm && (
        <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: 'var(--radius-md)', padding: 'var(--space-5)', marginBottom: 'var(--space-5)', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
          <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 700, marginBottom: 'var(--space-4)' }}>New Coupon</h2>
          {formError && <div style={{ background: '#ffebee', color: '#b71c1c', padding: 'var(--space-3)', borderRadius: 'var(--radius-sm)', marginBottom: 'var(--space-3)', fontSize: 'var(--text-sm)' }}>⚠️ {formError}</div>}
          <form onSubmit={handleCreate}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--space-4)', marginBottom: 'var(--space-4)' }}>
              <div>
                <label style={{ fontSize: 'var(--text-xs)', fontWeight: 700, display: 'block', marginBottom: 4 }}>Coupon Code *</label>
                <input style={inputStyle} placeholder="e.g. SAVE20" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} required />
              </div>
              <div>
                <label style={{ fontSize: 'var(--text-xs)', fontWeight: 700, display: 'block', marginBottom: 4 }}>Discount Type *</label>
                <select style={inputStyle} value={discountType} onChange={(e) => setDiscountType(e.target.value as Coupon['discount_type'])} required>
                  <option value="percentage">Percentage (%)</option>
                  <option value="fixed_amount">Fixed Amount (UGX)</option>
                  <option value="free_shipping">Free Shipping</option>
                </select>
              </div>
              {discountType !== 'free_shipping' && (
                <div>
                  <label style={{ fontSize: 'var(--text-xs)', fontWeight: 700, display: 'block', marginBottom: 4 }}>
                    Value * {discountType === 'percentage' ? '(%)' : '(UGX)'}
                  </label>
                  <input style={inputStyle} type="number" min="0" placeholder={discountType === 'percentage' ? '10' : '5000'} value={discountValue} onChange={(e) => setDiscountValue(e.target.value)} required />
                </div>
              )}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 'var(--space-4)', marginBottom: 'var(--space-4)' }}>
              <div>
                <label style={{ fontSize: 'var(--text-xs)', fontWeight: 700, display: 'block', marginBottom: 4 }}>Min Spend (UGX)</label>
                <input style={inputStyle} type="number" min="0" placeholder="50000" value={minSpend} onChange={(e) => setMinSpend(e.target.value)} />
              </div>
              <div>
                <label style={{ fontSize: 'var(--text-xs)', fontWeight: 700, display: 'block', marginBottom: 4 }}>Max Discount (UGX)</label>
                <input style={inputStyle} type="number" min="0" placeholder="20000" value={maxDiscount} onChange={(e) => setMaxDiscount(e.target.value)} />
              </div>
              <div>
                <label style={{ fontSize: 'var(--text-xs)', fontWeight: 700, display: 'block', marginBottom: 4 }}>Total Usage Limit</label>
                <input style={inputStyle} type="number" min="1" placeholder="100" value={usageLimit} onChange={(e) => setUsageLimit(e.target.value)} />
              </div>
              <div>
                <label style={{ fontSize: 'var(--text-xs)', fontWeight: 700, display: 'block', marginBottom: 4 }}>Per-User Limit</label>
                <input style={inputStyle} type="number" min="1" placeholder="1" value={perUserLimit} onChange={(e) => setPerUserLimit(e.target.value)} />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr auto', gap: 'var(--space-4)', marginBottom: 'var(--space-4)', alignItems: 'end' }}>
              <div>
                <label style={{ fontSize: 'var(--text-xs)', fontWeight: 700, display: 'block', marginBottom: 4 }}>Description</label>
                <input style={inputStyle} placeholder="e.g. 20% off for new customers" value={description} onChange={(e) => setDescription(e.target.value)} />
              </div>
              <div>
                <label style={{ fontSize: 'var(--text-xs)', fontWeight: 700, display: 'block', marginBottom: 4 }}>Expires At</label>
                <input style={inputStyle} type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--text-sm)', whiteSpace: 'nowrap', paddingBottom: 4, cursor: 'pointer' }}>
                <input type="checkbox" checked={firstOrderOnly} onChange={(e) => setFirstOrderOnly(e.target.checked)} />
                First order only
              </label>
            </div>
            <button
              type="submit"
              disabled={creating}
              style={{ background: 'linear-gradient(to bottom, #f7dfa5, #f0c14b)', border: '1px solid #a88734', color: '#111', fontWeight: 700, padding: 'var(--space-2) var(--space-6)', borderRadius: 'var(--radius-sm)', cursor: creating ? 'not-allowed' : 'pointer', opacity: creating ? 0.7 : 1 }}
            >
              {creating ? 'Creating…' : 'Create Coupon'}
            </button>
          </form>
        </div>
      )}

      {/* Coupons table */}
      <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: 'var(--radius-md)', overflowX: 'auto', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-sm)' }}>
          <thead>
            <tr style={{ background: '#f8f9fa', borderBottom: '2px solid #e0e0e0' }}>
              {['Code', 'Type', 'Value', 'Min Spend', 'Limits', 'Expires', 'Status', 'Actions'].map((h) => (
                <th key={h} style={{ padding: 'var(--space-3) var(--space-4)', textAlign: 'left', fontWeight: 700, fontSize: 'var(--text-xs)', color: '#555', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {coupons.length === 0 ? (
              <tr><td colSpan={8} style={{ padding: 'var(--space-8)', textAlign: 'center', color: '#999' }}>No coupons yet. Create your first one above.</td></tr>
            ) : coupons.map((coupon, i) => {
              const expired = coupon.is_expired;
              const rowBg = i % 2 === 0 ? '#fff' : '#fafafa';
              return (
                <tr key={coupon.id} style={{ background: rowBg, borderBottom: '1px solid #f0f0f0', opacity: expired ? 0.6 : 1 }}>
                  <td style={{ padding: 'var(--space-3) var(--space-4)', fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 'var(--text-base)', letterSpacing: '0.05em' }}>
                    {coupon.code}
                    {coupon.first_order_only && <div style={{ fontSize: 'var(--text-xs)', color: '#7b1fa2', fontFamily: 'inherit', fontWeight: 400 }}>First order only</div>}
                    {coupon.description && <div style={{ fontSize: 'var(--text-xs)', color: '#888', fontFamily: 'inherit', fontWeight: 400, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{coupon.description}</div>}
                  </td>
                  <td style={{ padding: 'var(--space-3) var(--space-4)', fontSize: 'var(--text-xs)' }}>{DISCOUNT_TYPE_LABELS[coupon.discount_type]}</td>
                  <td style={{ padding: 'var(--space-3) var(--space-4)', fontWeight: 700, color: '#b12704' }}>
                    {coupon.discount_type === 'percentage' ? `${coupon.discount_value}%` :
                     coupon.discount_type === 'fixed_amount' ? formatMoney(coupon.discount_value, coupon.currency) :
                     'Free shipping'}
                    {coupon.max_discount_amount && <div style={{ fontSize: 'var(--text-xs)', color: '#888', fontWeight: 400 }}>Max {formatMoney(coupon.max_discount_amount, coupon.currency)}</div>}
                  </td>
                  <td style={{ padding: 'var(--space-3) var(--space-4)', fontSize: 'var(--text-xs)', color: '#555' }}>
                    {coupon.min_spend ? formatMoney(coupon.min_spend, coupon.currency) : 'None'}
                  </td>
                  <td style={{ padding: 'var(--space-3) var(--space-4)', fontSize: 'var(--text-xs)', color: '#555' }}>
                    {coupon.usage_limit ? `${coupon.usage_limit} total` : 'Unlimited'}
                    {coupon.usage_limit_per_user && <div>{coupon.usage_limit_per_user}/user</div>}
                  </td>
                  <td style={{ padding: 'var(--space-3) var(--space-4)', fontSize: 'var(--text-xs)', whiteSpace: 'nowrap', color: expired ? '#b71c1c' : '#555' }}>
                    {coupon.expires_at ? formatDate(coupon.expires_at) : 'Never'}
                    {expired && <div style={{ color: '#b71c1c', fontWeight: 700 }}>EXPIRED</div>}
                  </td>
                  <td style={{ padding: 'var(--space-3) var(--space-4)' }}>
                    <span style={{
                      background: coupon.is_active && !expired ? '#e8f5e9' : '#f5f5f5',
                      color: coupon.is_active && !expired ? '#2e7d32' : '#757575',
                      fontSize: 'var(--text-xs)', fontWeight: 700, padding: '2px 10px', borderRadius: 999,
                    }}>
                      {coupon.is_active && !expired ? 'Active' : expired ? 'Expired' : 'Disabled'}
                    </span>
                  </td>
                  <td style={{ padding: 'var(--space-3) var(--space-4)', display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => handleToggle(coupon)}
                      style={{ background: coupon.is_active ? '#fff3e0' : '#e8f5e9', color: coupon.is_active ? '#e65100' : '#2e7d32', border: '1px solid', borderColor: coupon.is_active ? '#ffcc80' : '#a5d6a7', borderRadius: 'var(--radius-sm)', fontSize: 'var(--text-xs)', fontWeight: 700, padding: '2px 10px', cursor: 'pointer', whiteSpace: 'nowrap' }}
                    >
                      {coupon.is_active ? 'Disable' : 'Enable'}
                    </button>
                    <button
                      onClick={() => handleDelete(coupon.id)}
                      style={{ background: '#ffebee', color: '#b71c1c', border: '1px solid #ef9a9a', borderRadius: 'var(--radius-sm)', fontSize: 'var(--text-xs)', fontWeight: 700, padding: '2px 10px', cursor: 'pointer' }}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
