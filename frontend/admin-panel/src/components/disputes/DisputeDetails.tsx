import React from 'react';

export const DisputeDetails: React.FC = () => (
  <div style={{ backgroundColor: 'var(--color-surface)', padding: 'var(--space-4)', borderRadius: 'var(--radius-md)' }}>
    <h2>Dispute #D-0045</h2>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
      <div style={{ padding: 'var(--space-3)', backgroundColor: '#fff3cd', borderRadius: 'var(--radius-sm)' }}>
        <strong>Buyer:</strong> John Kizza<br/>
        <em>"I never received the item despite it being marked as delivered."</em>
      </div>
      <div style={{ padding: 'var(--space-3)', backgroundColor: '#d4edda', borderRadius: 'var(--radius-sm)' }}>
        <strong>Seller:</strong> Kampala Organics<br/>
        <em>"We shipped via boda-boda and have the delivery receipt."</em>
      </div>
    </div>
  </div>
);
