import React from 'react';
import { Spinner } from './Spinner/Spinner';

interface LoadingStateProps {
  /** Announced to assistive tech and shown to sighted users. */
  message?: string;
}

/**
 * The shared "still fetching" placeholder.
 *
 * `role="status"` and a visible label were missing: this rendered a bare
 * spinning SVG, which a screen reader announces as nothing at all, so a
 * non-sighted admin had no way to tell a loading table from an empty one.
 * That is also what made the state impossible to assert on in a test.
 */
export const LoadingState: React.FC<LoadingStateProps> = ({ message = 'Loading…' }) => (
  <div
    role="status"
    aria-live="polite"
    style={{
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-3)',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '300px',
      width: '100%',
    }}
  >
    <Spinner size={40} />
    <span style={{ color: 'var(--color-text-secondary)' }}>{message}</span>
  </div>
);
