import React from 'react';
import type { EscrowSummary } from '@/types/payout.types';

interface EscrowReconciliationDashboardProps {
  /** Live totals from payment-service's escrow ledger, or null while loading. */
  escrow: EscrowSummary | null;
  currency?: string;
  isLoading?: boolean;
}

// Figures come from payment-service's reconcileEscrowLedger(), which aggregates
// escrow_holds by status in the database. This component previously held five
// hardcoded numbers in useState and claimed "0 Discrepancies Detected" against
// them — an audit result asserted about data it had never seen.

const TILES = [
  { key: 'activeEscrowHoldUGX', label: 'Active Escrow Holds', bg: '#f0f9ff', border: '#bae6fd', labelFg: '#0369a1', valueFg: '#0284c7' },
  { key: 'disputeHoldUGX',      label: 'Dispute Freezes',     bg: '#fef2f2', border: '#fca5a5', labelFg: '#991b1b', valueFg: '#ef4444' },
  { key: 'releasedUGX',         label: 'Released to Vendors', bg: '#f0fdf4', border: '#bbf7d0', labelFg: '#15803d', valueFg: '#16a34a' },
  { key: 'refundedUGX',         label: 'Refunded to Buyers',  bg: '#fffbeb', border: '#fef3c7', labelFg: '#92400e', valueFg: '#b45309' },
] as const;

export const EscrowReconciliationDashboard: React.FC<EscrowReconciliationDashboardProps> = ({
  escrow,
  currency = 'UGX',
  isLoading,
}) => {
  const value = (key: (typeof TILES)[number]['key']): string => {
    if (!escrow) return isLoading ? '…' : '—';
    return `${Math.round(escrow[key]).toLocaleString()} ${currency}`;
  };

  return (
    <div style={{ padding: 20, background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 12 }}>
      <h2 style={{ fontSize: 18, margin: '0 0 16px 0', color: 'var(--color-text-primary)' }}>
        Escrow Ledger
      </h2>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 20 }}>
        {TILES.map((tile) => (
          <div key={tile.key} style={{ background: tile.bg, border: `1px solid ${tile.border}`, borderRadius: 8, padding: 14 }}>
            <div style={{ fontSize: 11, color: tile.labelFg, fontWeight: 600 }}>{tile.label}</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: tile.valueFg }}>{value(tile.key)}</div>
          </div>
        ))}
      </div>

      <div
        style={{
          padding: 14,
          background: 'var(--color-bg)',
          borderRadius: 8,
          border: '1px solid var(--color-border)',
          fontSize: 13,
          color: 'var(--color-text-secondary)',
        }}
      >
        {escrow
          ? `${escrow.totalEscrowEntries.toLocaleString()} escrow ${escrow.totalEscrowEntries === 1 ? 'entry' : 'entries'} on record.`
          : isLoading
            ? 'Loading escrow ledger…'
            : 'Escrow ledger unavailable.'}
      </div>
    </div>
  );
};

export default EscrowReconciliationDashboard;
