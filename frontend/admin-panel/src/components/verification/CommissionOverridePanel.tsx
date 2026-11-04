import React, { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/common/Button/Button';
import { Input } from '@/components/common/Input/Input';
import { Table } from '@/components/common/Table/Table';
import { TierBadge } from './TierBadge';
import type { CommissionOverride, SellerTier, VerificationApplication } from '@/types/kyc.types';

interface CommissionOverridePanelProps {
  applications: VerificationApplication[];
  overrides: CommissionOverride[];
  isSubmitting?: boolean;
  onSubmit: (override: CommissionOverride) => void;
}

const TIERS: SellerTier[] = ['bronze', 'silver', 'gold', 'platinum'];

const selectStyle: React.CSSProperties = {
  width: '100%',
  padding: 'var(--space-2)',
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--color-border)',
  fontSize: '14px',
  backgroundColor: 'var(--color-surface)',
  color: 'var(--color-text-primary)',
  boxSizing: 'border-box',
};

const fieldLabelStyle: React.CSSProperties = { fontSize: '13px', fontWeight: 500, display: 'block', marginBottom: '4px' };

export const CommissionOverridePanel: React.FC<CommissionOverridePanelProps> = ({
  applications,
  overrides,
  isSubmitting,
  onSubmit,
}) => {
  const sellers = useMemo(() => {
    const map = new Map<string, { sellerId: string; sellerName: string; businessName: string; tier: SellerTier }>();
    applications.forEach((a) => {
      if (!map.has(a.sellerId)) {
        map.set(a.sellerId, { sellerId: a.sellerId, sellerName: a.sellerName, businessName: a.businessName, tier: a.requestedTier });
      }
    });
    return Array.from(map.values());
  }, [applications]);

  const [sellerId, setSellerId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [tier, setTier] = useState<SellerTier>('bronze');
  const [rate, setRate] = useState<number>(10);
  const [effectiveFrom, setEffectiveFrom] = useState(() => new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (!sellerId && sellers.length > 0) {
      setSellerId(sellers[0].sellerId);
      setTier(sellers[0].tier);
    }
  }, [sellers, sellerId]);

  const handleSellerChange = (id: string) => {
    setSellerId(id);
    const found = sellers.find((s) => s.sellerId === id);
    if (found) setTier(found.tier);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!sellerId) return;
    onSubmit({
      sellerId,
      categoryId: categoryId.trim() ? categoryId.trim() : null,
      tier,
      commissionRatePercent: rate,
      effectiveFrom: new Date(effectiveFrom).toISOString(),
      reason: reason.trim() ? reason.trim() : undefined,
    });
    setReason('');
  };

  const sellerLabel = (id: string) => sellers.find((s) => s.sellerId === id)?.businessName ?? id;

  const columns = [
    { key: 'sellerId', label: 'Seller', render: (row: CommissionOverride) => sellerLabel(row.sellerId) },
    { key: 'categoryId', label: 'Category', render: (row: CommissionOverride) => row.categoryId ?? 'All categories' },
    { key: 'tier', label: 'Tier', render: (row: CommissionOverride) => <TierBadge tier={row.tier} /> },
    { key: 'commissionRatePercent', label: 'Rate', render: (row: CommissionOverride) => `${row.commissionRatePercent}%` },
    { key: 'effectiveFrom', label: 'Effective From', render: (row: CommissionOverride) => new Date(row.effectiveFrom).toLocaleDateString() },
    { key: 'reason', label: 'Reason', render: (row: CommissionOverride) => row.reason ?? '—' },
  ];

  return (
    <div style={{ backgroundColor: 'var(--color-surface)', borderRadius: 'var(--radius-md)', padding: 'var(--space-4)', boxShadow: 'var(--shadow-sm)' }}>
      <h3 style={{ marginTop: 0, marginBottom: 'var(--space-4)' }}>Commission Rate Overrides</h3>
      <form
        onSubmit={handleSubmit}
        style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 'var(--space-3)', alignItems: 'end', marginBottom: 'var(--space-5)' }}
      >
        <div>
          <label style={fieldLabelStyle}>Seller</label>
          <select value={sellerId} onChange={(e) => handleSellerChange(e.target.value)} style={selectStyle}>
            {sellers.map((s) => (
              <option key={s.sellerId} value={s.sellerId}>{s.businessName}</option>
            ))}
          </select>
        </div>
        <Input label="Category (optional)" placeholder="e.g. electronics" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} />
        <div>
          <label style={fieldLabelStyle}>Tier</label>
          <select value={tier} onChange={(e) => setTier(e.target.value as SellerTier)} style={selectStyle}>
            {TIERS.map((t) => (
              <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
            ))}
          </select>
        </div>
        <Input
          label="Commission Rate %"
          type="number"
          min={0}
          max={100}
          step={0.5}
          value={rate}
          onChange={(e) => setRate(Number(e.target.value))}
        />
        <Input label="Effective From" type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} />
        <Input label="Reason (optional)" placeholder="Reason for override" value={reason} onChange={(e) => setReason(e.target.value)} />
        <Button type="submit" variant="primary" isLoading={isSubmitting} disabled={!sellerId}>Set Override</Button>
      </form>

      <Table
        columns={columns}
        data={overrides}
        pageSize={5}
        getRowId={(row: CommissionOverride) => `${row.sellerId}-${row.categoryId ?? 'all'}-${row.effectiveFrom}`}
        emptyMessage="No commission overrides set yet"
      />
    </div>
  );
};
