import React from 'react';
import { Drawer } from '@/components/common/Drawer/Drawer';
import { Badge } from '@/components/common/Badge/Badge';
import { Button } from '@/components/common/Button/Button';
import { TierBadge } from './TierBadge';
import { DOC_TYPE_LABELS } from '@/mocks/sellers.mock';
import type { VerificationApplication, KycDocumentType } from '@/types/kyc.types';

const DOC_TYPE_COLORS: Record<KycDocumentType, string> = {
  passport: '#6366f1',
  business_license: '#0ea5e9',
  tax_id: '#f59e0b',
  bank_proof: '#10b981',
};

interface DocumentInspectionDrawerProps {
  application: VerificationApplication | null;
  isOpen: boolean;
  onClose: () => void;
  onOpenDecision: () => void;
}

export const DocumentInspectionDrawer: React.FC<DocumentInspectionDrawerProps> = ({
  application,
  isOpen,
  onClose,
  onOpenDecision,
}) => {
  if (!application) return null;

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      title={`${application.businessName} — KYC Documents`}
      width="560px"
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
          <Button variant="secondary" onClick={onClose}>Close</Button>
          <Button variant="primary" onClick={onOpenDecision}>Review Decision</Button>
        </div>
      }
    >
      <div style={{ marginBottom: 'var(--space-5)' }}>
        <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center', marginBottom: 'var(--space-2)', flexWrap: 'wrap' }}>
          <strong style={{ fontSize: '15px' }}>{application.sellerName}</strong>
          <TierBadge tier={application.requestedTier} />
          <Badge variant={application.status}>{application.status.replace(/_/g, ' ')}</Badge>
        </div>
        <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
          {application.country} • Submitted {new Date(application.submittedAt).toLocaleDateString()}
        </div>
        {application.notes && (
          <div
            style={{
              marginTop: 'var(--space-3)',
              padding: 'var(--space-3)',
              backgroundColor: 'var(--color-bg)',
              borderRadius: 'var(--radius-sm)',
              fontSize: '13px',
            }}
          >
            <strong>Note:</strong> {application.notes}
          </div>
        )}
      </div>

      <h3 style={{ fontSize: '14px', margin: '0 0 var(--space-3) 0' }}>Documents ({application.documents.length})</h3>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
        {application.documents.map((doc) => (
          <div
            key={doc.id}
            style={{
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-md)',
              overflow: 'hidden',
              backgroundColor: 'var(--color-surface)',
            }}
          >
            <div
              style={{
                height: '90px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: `${DOC_TYPE_COLORS[doc.type]}22`,
                color: DOC_TYPE_COLORS[doc.type],
                fontSize: '12px',
                fontWeight: 700,
                textAlign: 'center',
                padding: 'var(--space-2)',
              }}
            >
              {DOC_TYPE_LABELS[doc.type]}
            </div>
            <div style={{ padding: 'var(--space-2) var(--space-3)' }}>
              <div
                style={{
                  fontSize: '12px',
                  color: 'var(--color-text-secondary)',
                  marginBottom: '4px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {doc.fileName}
              </div>
              <Badge variant={doc.status}>{doc.status}</Badge>
            </div>
          </div>
        ))}
      </div>
    </Drawer>
  );
};
