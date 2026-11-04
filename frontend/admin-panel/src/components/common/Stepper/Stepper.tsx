import React from 'react';

interface StepperProps {
  steps: string[];
  currentStep: number;
}

export const Stepper: React.FC<StepperProps> = ({ steps, currentStep }) => {
  return (
    <div style={{ display: 'flex', alignItems: 'center', width: '100%', marginBottom: 'var(--space-5)' }}>
      {steps.map((step, i) => {
        const isDone = i < currentStep;
        const isActive = i === currentStep;
        return (
          <React.Fragment key={step}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-1)' }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '13px', fontWeight: 600,
                backgroundColor: isDone ? 'var(--color-success)' : isActive ? 'var(--color-accent)' : 'var(--color-border)',
                color: isDone || isActive ? '#fff' : 'var(--color-text-secondary)',
              }}>
                {isDone ? '✓' : i + 1}
              </div>
              <span style={{ fontSize: '12px', color: isActive ? 'var(--color-text-primary)' : 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>
                {step}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div style={{ flex: 1, height: 2, backgroundColor: isDone ? 'var(--color-success)' : 'var(--color-border)', margin: '0 var(--space-2)' }} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
};
