import React, { useState } from 'react';
import { Modal } from '@/components/common/Modal/Modal';
import { Button } from '@/components/common/Button/Button';
import { Stepper } from '@/components/common/Stepper/Stepper';
import { REJECTION_REASON_TEMPLATES } from '@/types/kyc.types';
import type { VerificationApplication, VerificationDecision } from '@/types/kyc.types';

interface VerificationDecisionModalProps {
  isOpen: boolean;
  onClose: () => void;
  application: VerificationApplication | null;
  isSubmitting?: boolean;
  onSubmit: (decision: VerificationDecision, payload: { reason?: string; note?: string }) => void;
}

const DECISION_OPTIONS: { key: VerificationDecision; label: string; description: string }[] = [
  { key: 'approve', label: 'Approve', description: 'Grant the requested tier and mark the seller as verified.' },
  { key: 'reject', label: 'Reject', description: 'Decline the application and provide a reason.' },
  { key: 'request_more_docs', label: 'Request Additional Documents', description: 'Ask the seller to resubmit or add documents.' },
];

const selectableCardStyle = (active: boolean): React.CSSProperties => ({
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
  padding: 'var(--space-3)',
  border: `1px solid ${active ? 'var(--color-accent)' : 'var(--color-border)'}`,
  borderRadius: 'var(--radius-md)',
  cursor: 'pointer',
  backgroundColor: active ? 'var(--color-bg)' : 'transparent',
});

export const VerificationDecisionModal: React.FC<VerificationDecisionModalProps> = ({
  isOpen,
  onClose,
  application,
  isSubmitting,
  onSubmit,
}) => {
  const [step, setStep] = useState(0);
  const [decision, setDecision] = useState<VerificationDecision | null>(null);
  const [reason, setReason] = useState<string>(REJECTION_REASON_TEMPLATES[0]);
  const [note, setNote] = useState('');

  const reset = () => {
    setStep(0);
    setDecision(null);
    setReason(REJECTION_REASON_TEMPLATES[0]);
    setNote('');
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = () => {
    if (!decision) return;
    const payload = decision === 'reject' ? { reason } : decision === 'request_more_docs' ? { note } : {};
    onSubmit(decision, payload);
    reset();
  };

  if (!application) return null;

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={`Decision — ${application.businessName}`} maxWidth="520px">
      <Stepper steps={['Select Decision', 'Confirm']} currentStep={step} />

      {step === 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          {DECISION_OPTIONS.map((opt) => (
            <label key={opt.key} style={selectableCardStyle(decision === opt.key)}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                <input type="radio" name="decision" checked={decision === opt.key} onChange={() => setDecision(opt.key)} />
                <strong style={{ fontSize: '14px' }}>{opt.label}</strong>
              </div>
              <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginLeft: '24px' }}>{opt.description}</span>
            </label>
          ))}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)', marginTop: 'var(--space-3)' }}>
            <Button variant="secondary" onClick={handleClose}>Cancel</Button>
            <Button variant="primary" disabled={!decision} onClick={() => setStep(1)}>Next</Button>
          </div>
        </div>
      )}

      {step === 1 && decision && (
        <div>
          {decision === 'reject' && (
            <div style={{ marginBottom: 'var(--space-4)' }}>
              <label style={{ fontSize: '14px', fontWeight: 500, marginBottom: 'var(--space-2)', display: 'block' }}>
                Rejection reason
              </label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                {REJECTION_REASON_TEMPLATES.map((r) => (
                  <label key={r} style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-2)', fontSize: '13px', cursor: 'pointer' }}>
                    <input type="radio" name="reason" checked={reason === r} onChange={() => setReason(r)} style={{ marginTop: '3px' }} />
                    {r}
                  </label>
                ))}
              </div>
            </div>
          )}

          {decision === 'request_more_docs' && (
            <div style={{ marginBottom: 'var(--space-4)' }}>
              <label style={{ fontSize: '14px', fontWeight: 500, marginBottom: 'var(--space-2)', display: 'block' }}>
                Note to seller
              </label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={4}
                placeholder="Describe what additional documents or corrections are needed…"
                style={{
                  width: '100%',
                  padding: 'var(--space-2)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--color-border)',
                  fontSize: '13px',
                  resize: 'vertical',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          )}

          {decision === 'approve' && (
            <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-4)' }}>
              This will approve <strong>{application.businessName}</strong> for the <strong>{application.requestedTier}</strong> tier.
            </p>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-2)' }}>
            <Button variant="secondary" onClick={() => setStep(0)}>Back</Button>
            <Button
              variant={decision === 'reject' ? 'danger' : 'primary'}
              isLoading={isSubmitting}
              disabled={decision === 'request_more_docs' && !note.trim()}
              onClick={handleSubmit}
            >
              Confirm {DECISION_OPTIONS.find((o) => o.key === decision)?.label}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
};
