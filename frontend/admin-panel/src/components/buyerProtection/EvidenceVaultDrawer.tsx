import React, { useState } from 'react';
import { Drawer } from '../common/Drawer/Drawer';
import type { EvidenceType, ProtectionClaim } from '@/types/buyerProtection.types';

const TYPE_ICON: Record<EvidenceType, string> = {
  chat_log: '💬',
  shipping_proof: '📦',
  photo: '🖼️',
  invoice: '🧾',
};

const TYPE_LABEL: Record<EvidenceType, string> = {
  chat_log: 'Chat Log',
  shipping_proof: 'Shipping Proof',
  photo: 'Photo',
  invoice: 'Invoice',
};

interface EvidenceVaultDrawerProps {
  claim: ProtectionClaim | null;
  isOpen: boolean;
  onClose: () => void;
}

export const EvidenceVaultDrawer: React.FC<EvidenceVaultDrawerProps> = ({ claim, isOpen, onClose }) => {
  const [previewId, setPreviewId] = useState<string | null>(null);

  if (!claim) return null;

  return (
    <Drawer isOpen={isOpen} onClose={onClose} title={`Evidence Vault — ${claim.orderId}`}>
      <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-4)' }}>
        {claim.evidence.length} item{claim.evidence.length === 1 ? '' : 's'} submitted for this claim ({claim.buyerName} vs. {claim.sellerName}).
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        {claim.evidence.map((ev) => (
          <div key={ev.id} style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: 'var(--space-3)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 4 }}>
              <span style={{ fontSize: '18px' }}>{TYPE_ICON[ev.type]}</span>
              <span style={{ fontWeight: 700, fontSize: '13px' }}>{ev.label}</span>
              <span style={{
                marginLeft: 'auto', fontSize: '11px', fontWeight: 600, color: 'var(--color-text-secondary)',
                textTransform: 'uppercase',
              }}>
                {TYPE_LABEL[ev.type]}
              </span>
            </div>
            <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginBottom: 8 }}>
              Submitted by {ev.submittedBy} • {new Date(ev.submittedAt).toLocaleString()}
            </div>
            <button
              onClick={() => setPreviewId(previewId === ev.id ? null : ev.id)}
              style={{
                fontSize: '12px', color: 'var(--color-accent)', background: 'none',
                border: '1px solid var(--color-accent)', borderRadius: 'var(--radius-sm)',
                padding: '4px 10px', cursor: 'pointer', fontWeight: 600,
              }}
            >
              {previewId === ev.id ? 'Hide preview' : 'View'}
            </button>
            {previewId === ev.id && (
              <div style={{ marginTop: 8, padding: 8, background: 'var(--color-bg)', borderRadius: 'var(--radius-sm)', fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                Preview placeholder — mock {TYPE_LABEL[ev.type].toLowerCase()} file is not attached in this environment.
              </div>
            )}
          </div>
        ))}
      </div>
    </Drawer>
  );
};
