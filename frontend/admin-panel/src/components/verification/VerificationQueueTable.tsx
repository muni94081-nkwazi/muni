import React from 'react';
import { Table } from '@/components/common/Table/Table';
import { Badge } from '@/components/common/Badge/Badge';
import { Button } from '@/components/common/Button/Button';
import { TierBadge } from './TierBadge';
import type { VerificationApplication } from '@/types/kyc.types';

interface VerificationQueueTableProps {
  applications: VerificationApplication[];
  isLoading?: boolean;
  onInspect: (application: VerificationApplication) => void;
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
  more_docs_requested: 'More Docs Requested',
};

export const VerificationQueueTable: React.FC<VerificationQueueTableProps> = ({ applications, isLoading, onInspect }) => {
  const columns = [
    {
      key: 'sellerName',
      label: 'Seller',
      sortAccessor: (row: VerificationApplication) => row.sellerName,
      render: (row: VerificationApplication) => (
        <div>
          <div style={{ fontWeight: 600 }}>{row.sellerName}</div>
          <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>{row.businessName}</div>
        </div>
      ),
    },
    {
      key: 'country',
      label: 'Country',
      sortAccessor: (row: VerificationApplication) => row.country,
    },
    {
      key: 'requestedTier',
      label: 'Requested Tier',
      sortAccessor: (row: VerificationApplication) => row.requestedTier,
      render: (row: VerificationApplication) => <TierBadge tier={row.requestedTier} />,
    },
    {
      key: 'status',
      label: 'Status',
      sortAccessor: (row: VerificationApplication) => row.status,
      render: (row: VerificationApplication) => <Badge variant={row.status}>{STATUS_LABELS[row.status] ?? row.status}</Badge>,
    },
    {
      key: 'submittedAt',
      label: 'Submitted',
      sortAccessor: (row: VerificationApplication) => row.submittedAt,
      render: (row: VerificationApplication) => new Date(row.submittedAt).toLocaleDateString(),
    },
    {
      key: 'actions',
      label: '',
      render: (row: VerificationApplication) => (
        <Button
          size="sm"
          variant="outline"
          onClick={(e) => {
            e.stopPropagation();
            onInspect(row);
          }}
        >
          Inspect
        </Button>
      ),
    },
  ];

  return (
    <Table
      columns={columns}
      data={applications}
      isLoading={isLoading}
      sortable
      searchable
      searchPlaceholder="Search by seller, business or country…"
      pageSize={10}
      onRowClick={onInspect}
      emptyMessage="No verification applications found"
    />
  );
};
