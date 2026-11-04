import React, { useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/common/Badge/Badge';
import { Button } from '@/components/common/Button/Button';
import { LoadingState } from '@/components/common/LoadingState';
import { Modal } from '@/components/common/Modal/Modal';
import { Table } from '@/components/common/Table/Table';
import { AcosRoasChart } from '@/components/advertising/AcosRoasChart';
import { CampaignBuilder } from '@/components/advertising/CampaignBuilder';
import { advertisingApi } from '@/api/advertising.api';
import type { Campaign } from '@/types/advertising.types';
import { logger } from '@/utils/logger';

export const AdvertisingCampaignsPage: React.FC = () => {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showBuilder, setShowBuilder] = useState(false);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setIsLoading(true);
      try {
        const data = await advertisingApi.listCampaigns();
        if (cancelled) return;
        setCampaigns(data);
        setSelectedCampaignId((prev) => prev ?? data[0]?.id ?? null);
      } catch (err) {
        if (!cancelled) logger.error('[AdvertisingCampaignsPage] Failed to load campaigns:', err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedCampaign = useMemo(
    () => campaigns.find((c) => c.id === selectedCampaignId) ?? null,
    [campaigns, selectedCampaignId]
  );

  const handleCreateCampaign = async (campaign: Campaign) => {
    setIsSaving(true);
    try {
      const created = await advertisingApi.createCampaign(campaign);
      setCampaigns((prev) => [created, ...prev]);
      setSelectedCampaignId(created.id);
      setShowBuilder(false);
    } catch (err) {
      logger.error('[AdvertisingCampaignsPage] Failed to create campaign:', err);
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return <LoadingState message="Loading advertising campaigns..." />;
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--spacing-6)' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, margin: 0 }}>Sponsored Products Advertising</h1>
          <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
            Run Cost-Per-Click search campaigns to boost product placement and track ACoS / ROAS performance.
          </p>
        </div>
        <Button variant="primary" onClick={() => setShowBuilder(true)}>+ Create Campaign</Button>
      </div>

      <div style={{ marginBottom: 'var(--spacing-6)' }}>
        <Table<Campaign>
          columns={[
            { key: 'name', label: 'Campaign', sortAccessor: (c) => c.name },
            {
              key: 'status',
              label: 'Status',
              sortAccessor: (c) => c.status,
              render: (c) => <Badge variant={c.status} label={c.status.charAt(0).toUpperCase() + c.status.slice(1)} />,
            },
            { key: 'dailyBudget', label: 'Daily Budget', sortAccessor: (c) => c.dailyBudget, render: (c) => `$${c.dailyBudget.toFixed(2)}` },
            { key: 'spend', label: 'Spend', sortAccessor: (c) => c.metrics.spend, render: (c) => `$${c.metrics.spend.toFixed(2)}` },
            { key: 'sales', label: 'Sales', sortAccessor: (c) => c.metrics.sales, render: (c) => `$${c.metrics.sales.toFixed(2)}` },
            { key: 'acos', label: 'ACoS', sortAccessor: (c) => c.metrics.acos, render: (c) => `${c.metrics.acos.toFixed(1)}%` },
            { key: 'roas', label: 'ROAS', sortAccessor: (c) => c.metrics.roas, render: (c) => `${c.metrics.roas.toFixed(2)}x` },
            { key: 'adGroups', label: 'Ad Groups', sortAccessor: (c) => c.adGroups.length, render: (c) => c.adGroups.length },
          ]}
          data={campaigns}
          sortable
          searchable
          searchPlaceholder="Search campaigns..."
          pageSize={8}
          onRowClick={(c) => setSelectedCampaignId(c.id)}
          emptyMessage="No campaigns yet. Create your first Sponsored Products campaign to get started."
        />
      </div>

      {selectedCampaign && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--spacing-4)' }}>
            <h2 style={{ fontSize: '1.125rem', fontWeight: 700, margin: 0 }}>
              Performance: {selectedCampaign.name}
            </h2>
            <Badge variant={selectedCampaign.status} label={selectedCampaign.status.charAt(0).toUpperCase() + selectedCampaign.status.slice(1)} />
          </div>
          <AcosRoasChart campaign={selectedCampaign} />
        </div>
      )}

      <Modal isOpen={showBuilder} onClose={() => setShowBuilder(false)} title="Create Sponsored Products Campaign" maxWidth="720px">
        <CampaignBuilder
          onSubmit={(c) => void handleCreateCampaign(c)}
          onCancel={() => setShowBuilder(false)}
        />
        {isSaving && <p style={{ marginTop: 'var(--spacing-3)', fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>Saving campaign...</p>}
      </Modal>
    </div>
  );
};

export default AdvertisingCampaignsPage;
