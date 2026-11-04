import React, { useCallback, useEffect, useState } from 'react';
import { Table } from '../common/Table/Table';
import { Badge } from '../common/Badge/Badge';
import { Button } from '../common/Button/Button';
import { LoadingState } from '../common/LoadingState';
import { EmptyState } from '../common/EmptyState';
import { EvidenceVaultDrawer } from './EvidenceVaultDrawer';
import { RefundChargebackActions } from './RefundChargebackActions';
import { buyerProtectionApi } from '@/api/buyerProtection.api';
import type { ProtectionClaim } from '@/types/buyerProtection.types';
import { logger } from '@/utils/logger';

export const ClaimsDesk: React.FC = () => {
  const [claims, setClaims] = useState<ProtectionClaim[]>([]);
  const [loading, setLoading] = useState(true);
  // A failed load used to be logged and then rendered as an empty table, which
  // reads as "no claims have been filed" — the opposite of the truth, on a
  // screen where a missed claim is a customer waiting on a refund.
  const [error, setError] = useState<string | null>(null);
  const [evidenceClaim, setEvidenceClaim] = useState<ProtectionClaim | null>(null);

  const load = useCallback(async (signal?: { active: boolean }) => {
    setLoading(true);
    setError(null);
    try {
      const res = await buyerProtectionApi.list(1, 50);
      if (signal && !signal.active) return;
      setClaims(res.data.items);
    } catch (err) {
      if (signal && !signal.active) return;
      logger.error('[ClaimsDesk] Failed to load claims:', err);
      setError(err instanceof Error ? err.message : 'Claims could not be loaded.');
    } finally {
      if (!signal || signal.active) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const signal = { active: true };
    void load(signal);
    return () => { signal.active = false; };
  }, [load]);

  const handleDecisionApplied = (updated: ProtectionClaim) => {
    setClaims((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
    setEvidenceClaim((prev) => (prev && prev.id === updated.id ? updated : prev));
  };

  const columns = [
    { key: 'orderId', label: 'Order' },
    { key: 'buyerName', label: 'Buyer' },
    { key: 'sellerName', label: 'Seller' },
    { key: 'reason', label: 'Reason' },
    {
      key: 'amount', label: 'Amount',
      render: (c: ProtectionClaim) => `${c.currency} ${c.amount.toLocaleString()}`,
      sortAccessor: (c: ProtectionClaim) => c.amount,
    },
    {
      key: 'status', label: 'Status',
      render: (c: ProtectionClaim) => <Badge variant={c.status}>{c.status.replace(/_/g, ' ')}</Badge>,
    },
    {
      key: 'evidence', label: 'Evidence',
      render: (c: ProtectionClaim) => (
        <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); setEvidenceClaim(c); }}>
          🗂️ {c.evidence.length} item{c.evidence.length === 1 ? '' : 's'}
        </Button>
      ),
    },
    {
      key: 'decision', label: 'Decision',
      render: (c: ProtectionClaim) => (
        <div onClick={(e) => e.stopPropagation()}>
          <RefundChargebackActions claim={c} onDecisionApplied={handleDecisionApplied} />
        </div>
      ),
    },
  ];

  // Order matters: loading and error are checked before "empty", so an empty
  // table only ever means the request succeeded and returned nothing.
  if (loading) return <LoadingState message="Loading protection claims…" />;

  if (error) {
    return (
      <EmptyState
        icon="⚠️"
        title="Could not load claims"
        description={error}
        actionText="Retry"
        onAction={() => void load()}
      />
    );
  }

  return (
    <div>
      {claims.length === 0 ? (
        <EmptyState title="No protection claims" description="There are currently no buyer protection claims filed." />
      ) : (
        <Table
          columns={columns}
          data={claims}
          searchable
          searchPlaceholder="Search claims by order, buyer, seller, or reason…"
          sortable
          pageSize={8}
          getRowId={(c: ProtectionClaim) => c.id}
        />
      )}
      <EvidenceVaultDrawer claim={evidenceClaim} isOpen={!!evidenceClaim} onClose={() => setEvidenceClaim(null)} />
    </div>
  );
};
