import React, { useEffect, useState } from 'react';
import { Table } from '../common/Table/Table';
import { Badge } from '../common/Badge/Badge';
import { Button } from '../common/Button/Button';
import { LoadingState } from '../common/LoadingState';
import { EmptyState } from '../common/EmptyState';
import { PortAssignmentPanel } from './PortAssignmentPanel';
import { containersApi } from '@/api/containers.api';
import type { FreightContainer } from '@/types/container.types';
import { logger } from '@/utils/logger';

export const ContainerFreightTracker: React.FC = () => {
  const [containers, setContainers] = useState<FreightContainer[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<FreightContainer | null>(null);

  useEffect(() => {
    let active = true;
    containersApi.list(1, 50)
      .then((res) => {
        if (!active) return;
        setContainers(res.data.items);
        setLoading(false);
      })
      .catch((err) => {
        if (!active) return;
        logger.error('[ContainerFreightTracker] Failed to load containers:', err);
        setLoading(false);
      });
    return () => { active = false; };
  }, []);

  const columns = [
    { key: 'containerNumber', label: 'Container #' },
    { key: 'originCountry', label: 'Origin' },
    { key: 'destinationPort', label: 'Destination Port' },
    { key: 'status', label: 'Status', render: (c: FreightContainer) => <Badge variant={c.status}>{c.status.replace(/_/g, ' ')}</Badge> },
    { key: 'customsStatus', label: 'Customs', render: (c: FreightContainer) => <Badge variant={c.customsStatus}>{c.customsStatus.replace(/_/g, ' ')}</Badge> },
    { key: 'orderCount', label: 'Orders' },
    {
      key: 'estimatedArrival', label: 'ETA',
      render: (c: FreightContainer) => new Date(c.estimatedArrival).toLocaleDateString(),
      sortAccessor: (c: FreightContainer) => c.estimatedArrival,
    },
    {
      key: 'actions', label: '',
      render: (c: FreightContainer) => (
        <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); setSelected(c); }}>Port Info</Button>
      ),
    },
  ];

  if (loading) return <LoadingState />;

  return (
    <div>
      {containers.length === 0 ? (
        <EmptyState title="No freight containers" description="No containers are currently being tracked." />
      ) : (
        <Table
          columns={columns}
          data={containers}
          sortable
          searchable
          searchPlaceholder="Search containers by number, origin, or port…"
          pageSize={8}
          getRowId={(c: FreightContainer) => c.id}
          onRowClick={setSelected}
        />
      )}
      <PortAssignmentPanel container={selected} isOpen={!!selected} onClose={() => setSelected(null)} />
    </div>
  );
};
