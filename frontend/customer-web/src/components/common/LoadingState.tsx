import { Spinner } from './Spinner/Spinner';

export interface LoadingStateProps {
  label?: string;
}

/**
 * Standalone loading indicator for a whole page/section (as opposed to
 * Spinner alone, which is decorative/aria-hidden so it doesn't corrupt
 * a parent control's accessible name when nested in e.g. Button). This
 * wrapper owns the role="status" + accessible label instead, so screen
 * reader users get a single, correct "Loading products" announcement
 * rather than the Spinner trying to announce itself from inside an
 * already-labeled context.
 */
export function LoadingState({ label = 'Loading' }: LoadingStateProps) {
  return (
    <div
      role="status"
      style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-10)' }}
    >
      <Spinner size="lg" />
      <span className="visually-hidden">{label}</span>
    </div>
  );
}
