import React, { useState } from 'react';
import { Button } from '../common/Button/Button';
import { Modal } from '../common/Modal/Modal';
import { useToast } from '@/hooks/useToast';
import { buyerProtectionApi } from '@/api/buyerProtection.api';
import type { ProtectionClaim, RefundDecision } from '@/types/buyerProtection.types';
import { logger } from '@/utils/logger';

interface RefundChargebackActionsProps {
  claim: ProtectionClaim;
  onDecisionApplied: (updated: ProtectionClaim) => void;
}

const DECISION_META: Record<RefundDecision, { label: string; variant: 'primary' | 'secondary' | 'danger' | 'outline'; confirmText: string }> = {
  full_refund: { label: 'Full Refund', variant: 'primary', confirmText: 'issue a full refund to the buyer' },
  partial_refund: { label: 'Partial Refund', variant: 'secondary', confirmText: 'issue a partial refund to the buyer' },
  deny: { label: 'Deny', variant: 'danger', confirmText: 'deny this claim' },
  chargeback_release: { label: 'Release Chargeback', variant: 'outline', confirmText: 'release the chargeback hold' },
};

const DECISIONS = Object.keys(DECISION_META) as RefundDecision[];

// One-click refund / chargeback release actions. Each opens a small confirm Modal before
// applying — mock-backed via buyerProtectionApi.applyDecision, which updates the claim status.
export const RefundChargebackActions: React.FC<RefundChargebackActionsProps> = ({ claim, onDecisionApplied }) => {
  const { show } = useToast();
  const [pending, setPending] = useState<RefundDecision | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const resolved = claim.status === 'resolved_refund' || claim.status === 'resolved_denied';

  const handleConfirm = async () => {
    if (!pending) return;
    setSubmitting(true);
    try {
      const res = await buyerProtectionApi.applyDecision(claim.id, pending);
      onDecisionApplied(res.data);
      show(res.message ?? `Decision applied for claim on order ${claim.orderId}.`, 'success');
    } catch (err) {
      logger.error('[RefundChargebackActions] Failed to apply decision:', err);
      show('Failed to apply decision. Please try again.', 'error');
    } finally {
      setSubmitting(false);
      setPending(null);
    }
  };

  return (
    <>
      <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
        {DECISIONS.map((decision) => (
          <Button
            key={decision}
            size="sm"
            variant={DECISION_META[decision].variant}
            disabled={resolved}
            onClick={(e) => { e.stopPropagation(); setPending(decision); }}
          >
            {DECISION_META[decision].label}
          </Button>
        ))}
      </div>

      <Modal isOpen={!!pending} onClose={() => setPending(null)} title="Confirm decision">
        {pending && (
          <>
            <p style={{ fontSize: '14px', marginBottom: 'var(--space-4)' }}>
              You're about to <strong>{DECISION_META[pending].confirmText}</strong> for the claim on order{' '}
              <strong>{claim.orderId}</strong> ({claim.currency} {claim.amount.toLocaleString()}). This cannot be undone in this session.
            </p>
            <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end' }}>
              <Button variant="ghost" onClick={() => setPending(null)} disabled={submitting}>Cancel</Button>
              <Button variant="primary" isLoading={submitting} onClick={handleConfirm}>Confirm</Button>
            </div>
          </>
        )}
      </Modal>
    </>
  );
};
