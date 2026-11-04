import React from 'react';
import { Drawer } from '../common/Drawer/Drawer';
import { Badge } from '../common/Badge/Badge';
import type { FreightContainer } from '@/types/container.types';

interface PortAssignmentPanelProps {
  container: FreightContainer | null;
  isOpen: boolean;
  onClose: () => void;
}

export const PortAssignmentPanel: React.FC<PortAssignmentPanelProps> = ({ container, isOpen, onClose }) => {
  if (!container) return null;

  const rows: [string, React.ReactNode][] = [
    ['Port Code', container.portAssignment.portCode],
    ['Port Name', container.portAssignment.portName],
    ['Berth', container.portAssignment.berth ?? 'Not yet assigned'],
    ['ETA', new Date(container.portAssignment.eta).toLocaleString()],
    ['Origin Country', container.originCountry],
    ['Destination Port', container.destinationPort],
    ['Orders Aboard', String(container.orderCount)],
    ['Sellers Aboard', String(container.sellerIds.length)],
    ['Departed', container.departedAt ? new Date(container.departedAt).toLocaleString() : 'Not yet departed'],
  ];

  return (
    <Drawer isOpen={isOpen} onClose={onClose} title={`Port Assignment — ${container.containerNumber}`}>
      <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
        <Badge variant={container.status}>{container.status.replace(/_/g, ' ')}</Badge>
        <Badge variant={container.customsStatus}>{container.customsStatus.replace(/_/g, ' ')}</Badge>
      </div>
      {rows.map(([k, v]) => (
        <div key={k} style={{ display: 'flex', gap: 8, marginBottom: 10, fontSize: '13px' }}>
          <span style={{ fontWeight: 700, minWidth: 130, color: 'var(--color-text-secondary)' }}>{k}:</span>
          <span>{v}</span>
        </div>
      ))}
    </Drawer>
  );
};
