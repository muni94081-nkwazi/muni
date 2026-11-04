import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAppDispatch } from '@/store/hooks/useAppSelector';
import { StatCard } from '@/components/common/StatCard';
import { LoadingState } from '@/components/common/LoadingState';
import { useToast } from '@/hooks/useToast';
import { VerificationQueueTable } from '@/components/verification/VerificationQueueTable';
import { DocumentInspectionDrawer } from '@/components/verification/DocumentInspectionDrawer';
import { VerificationDecisionModal } from '@/components/verification/VerificationDecisionModal';
import { CommissionOverridePanel } from '@/components/verification/CommissionOverridePanel';
import {
  fetchApplicationsThunk,
  decideApplicationThunk,
  fetchCommissionOverridesThunk,
  setCommissionOverrideThunk,
} from '@/store/slices/verificationSlice';
import type { VerificationApplication, VerificationDecision, CommissionOverride } from '@/types/kyc.types';

function decisionVerb(decision: VerificationDecision): string {
  switch (decision) {
    case 'approve':
      return 'approved';
    case 'reject':
      return 'rejected';
    case 'request_more_docs':
      return 'sent a request for more documents';
    default:
      return 'updated';
  }
}

export function SellerVerificationPage() {
  const dispatch = useAppDispatch();
  const toast = useToast();

  const [applications, setApplications] = useState<VerificationApplication[]>([]);
  const [overrides, setOverrides] = useState<CommissionOverride[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeciding, setIsDeciding] = useState(false);
  const [isSettingOverride, setIsSettingOverride] = useState(false);

  const [inspecting, setInspecting] = useState<VerificationApplication | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [decisionOpen, setDecisionOpen] = useState(false);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [apps, ovr] = await Promise.all([
        dispatch(fetchApplicationsThunk()).unwrap(),
        dispatch(fetchCommissionOverridesThunk()).unwrap(),
      ]);
      setApplications(apps);
      setOverrides(ovr);
    } catch {
      toast.show('Failed to load the seller verification queue', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [dispatch, toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleInspect = (application: VerificationApplication) => {
    setInspecting(application);
    setDrawerOpen(true);
  };

  const handleOpenDecision = () => {
    setDrawerOpen(false);
    setDecisionOpen(true);
  };

  const handleDecide = async (decision: VerificationDecision, payload: { reason?: string; note?: string }) => {
    if (!inspecting) return;
    setIsDeciding(true);
    try {
      const updated = await dispatch(decideApplicationThunk({ id: inspecting.id, decision, payload })).unwrap();
      setApplications((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
      toast.show(`Application for ${updated.businessName} was ${decisionVerb(decision)}`, 'success');
      setDecisionOpen(false);
      setInspecting(null);
    } catch {
      toast.show('Failed to record the verification decision', 'error');
    } finally {
      setIsDeciding(false);
    }
  };

  const handleSetOverride = async (override: CommissionOverride) => {
    setIsSettingOverride(true);
    try {
      const saved = await dispatch(setCommissionOverrideThunk(override)).unwrap();
      setOverrides((prev) => [
        saved,
        ...prev.filter((o) => !(o.sellerId === saved.sellerId && o.categoryId === saved.categoryId)),
      ]);
      toast.show('Commission override saved', 'success');
    } catch {
      toast.show('Failed to save the commission override', 'error');
    } finally {
      setIsSettingOverride(false);
    }
  };

  const counts = useMemo(
    () => ({
      pending: applications.filter((a) => a.status === 'pending').length,
      approved: applications.filter((a) => a.status === 'approved').length,
      rejected: applications.filter((a) => a.status === 'rejected').length,
      moreDocs: applications.filter((a) => a.status === 'more_docs_requested').length,
    }),
    [applications]
  );

  return (
    <div>
      <div style={{ marginBottom: 'var(--space-5)' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>Seller Verification &amp; KYC</h1>
        <p style={{ fontSize: '14px', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
          Review seller KYC/KYB applications, inspect submitted documents, and manage commission overrides.
        </p>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 'var(--space-4)',
          marginBottom: 'var(--space-5)',
        }}
      >
        <StatCard label="Pending Review" value={counts.pending} icon="⏳" colorVariant="#f59e0b" />
        <StatCard label="Approved" value={counts.approved} icon="✅" colorVariant="#10b981" />
        <StatCard label="Rejected" value={counts.rejected} icon="⛔" colorVariant="#ef4444" />
        <StatCard label="More Docs Requested" value={counts.moreDocs} icon="📄" colorVariant="#6366f1" />
      </div>

      {isLoading ? (
        <LoadingState />
      ) : (
        <VerificationQueueTable applications={applications} onInspect={handleInspect} />
      )}

      <div style={{ marginTop: 'var(--space-6)' }}>
        <CommissionOverridePanel
          applications={applications}
          overrides={overrides}
          isSubmitting={isSettingOverride}
          onSubmit={handleSetOverride}
        />
      </div>

      <DocumentInspectionDrawer
        application={inspecting}
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onOpenDecision={handleOpenDecision}
      />

      <VerificationDecisionModal
        isOpen={decisionOpen}
        onClose={() => setDecisionOpen(false)}
        application={inspecting}
        isSubmitting={isDeciding}
        onSubmit={handleDecide}
      />
    </div>
  );
}
