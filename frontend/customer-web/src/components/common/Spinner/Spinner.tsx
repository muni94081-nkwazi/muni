import { classNames } from '@/utils/helpers';
import styles from './Spinner.module.css';

export interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  label?: string;
  className?: string;
}

/**
 * Purely decorative by default (aria-hidden) — when nested inside a
 * control that already communicates its own busy state (e.g. Button's
 * aria-busy + visible label), an additional "Loading" text node would
 * get folded into that control's accessible name and corrupt it (e.g.
 * a button labeled "Placing order" would announce as "Loading Placing
 * order"). Pass `standalone` usage patterns (a bare loading state with
 * no surrounding labeled control) should use the label for screen
 * readers via a wrapping element with its own role="status" instead.
 */
export function Spinner({ size = 'md', label, className }: SpinnerProps) {
  return (
    <span className={classNames(styles.spinner, styles[size], className)} aria-hidden="true">
      {label && <span className="visually-hidden">{label}</span>}
    </span>
  );
}
