import React from 'react';
import { appealsApi, APPEALS_UNAVAILABLE_MESSAGE } from '@/api/scorecard.api';

// ─── Policy violation appeals ─────────────────────────────────────────────────
//
// This was a working-looking form: a seller described the violation, wrote a
// statement, pressed Submit, and was told "Appeal submitted. Our trust &
// safety team will respond within 3-5 business days." No such team was
// contacted. There is no appeals endpoint anywhere in backend/services — the
// appeal was pushed onto an array in the API module and lost on reload, and
// the "Previous Appeals" list underneath was three generated examples.
//
// A seller reading that would stop chasing a suspension they believed was
// under review. So until an appeals service exists, this says what is true and
// points at the channel that does reach someone. `appealsApi.isAvailable()` is
// the switch to flip when it does.

export const PolicyAppealBox: React.FC = () => {
  const available = appealsApi.isAvailable();

  return (
    <div
      style={{
        backgroundColor: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-lg)',
        padding: 'var(--spacing-4)',
      }}
    >
      <h3 style={{ margin: '0 0 4px 0', fontSize: '15px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
        Policy Violation Appeals
      </h3>

      {available ? null : (
        <>
          <p style={{ margin: '0 0 12px 0', fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>
            {APPEALS_UNAVAILABLE_MESSAGE}
          </p>
          <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>
            If you believe a metric above was counted in error, raise it with seller support and
            quote the affected order numbers — the metrics on this page are recalculated from order,
            dispute and claim records, so a correction there is what moves them.
          </p>
        </>
      )}
    </div>
  );
};
