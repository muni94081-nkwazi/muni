import { classNames } from '@/utils/helpers';

export type CheckoutStep = 'shipping' | 'payment' | 'review';

const steps: Array<{ key: CheckoutStep; label: string }> = [
  { key: 'shipping', label: 'Shipping' },
  { key: 'payment', label: 'Payment' },
  { key: 'review', label: 'Review' },
];

export interface CheckoutStepperProps {
  current: CheckoutStep;
}

export function CheckoutStepper({ current }: CheckoutStepperProps) {
  const currentIndex = steps.findIndex((s) => s.key === current);

  return (
    <ol style={{ display: 'flex', gap: 'var(--space-3)', marginBottom: 'var(--space-6)' }} aria-label="Checkout progress">
      {steps.map((step, index) => {
        const isComplete = index < currentIndex;
        const isCurrent = index === currentIndex;

        return (
          <li key={step.key} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flex: 1 }}>
            <span
              className={classNames('checkout-step-dot')}
              aria-current={isCurrent ? 'step' : undefined}
              style={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 'var(--text-xs)',
                fontWeight: 700,
                flexShrink: 0,
                background: isComplete || isCurrent ? 'var(--color-market-green)' : 'var(--color-surface-muted)',
                color: isComplete || isCurrent ? 'var(--color-text-on-dark)' : 'var(--color-text-secondary)',
              }}
            >
              {isComplete ? '✓' : index + 1}
            </span>
            <span
              style={{
                fontSize: 'var(--text-sm)',
                fontWeight: isCurrent ? 700 : 500,
                color: isCurrent ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
              }}
            >
              {step.label}
            </span>
            {index < steps.length - 1 && (
              <span style={{ flex: 1, height: 1, background: 'var(--color-border)', marginLeft: 'var(--space-2)' }} />
            )}
          </li>
        );
      })}
    </ol>
  );
}
