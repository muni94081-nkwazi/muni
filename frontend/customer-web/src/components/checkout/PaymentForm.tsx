import { useState, type FormEvent } from 'react';
import { Input } from '@/components/common/Input/Input';
import { Button } from '@/components/common/Button/Button';
import { isValidUgandanPhone } from '@/utils/validators';
import type { PaymentMethod } from '@/types/order.types';
import { classNames } from '@/utils/helpers';

export interface PaymentFormValues {
  paymentMethod: PaymentMethod;
  phoneNumber?: string;
}

export interface PaymentFormProps {
  defaultPhone?: string;
  onSubmit: (values: PaymentFormValues) => void;
  isSubmitting?: boolean;
}

const methods: Array<{ value: PaymentMethod; label: string; description: string }> = [
  { value: 'mtn_momo', label: 'MTN Mobile Money', description: 'Pay via a prompt sent to your MTN number' },
  { value: 'airtel_money', label: 'Airtel Money', description: 'Pay via a prompt sent to your Airtel number' },
  { value: 'cod', label: 'Cash on Delivery', description: 'Pay the courier when your order arrives' },
];

export function PaymentForm({ defaultPhone = '', onSubmit, isSubmitting }: PaymentFormProps) {
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('mtn_momo');
  const [phoneNumber, setPhoneNumber] = useState(defaultPhone);
  const [phoneError, setPhoneError] = useState<string | null>(null);

  const requiresPhone = paymentMethod === 'mtn_momo' || paymentMethod === 'airtel_money';

  function handleSubmit(event: FormEvent) {
    event.preventDefault();

    if (requiresPhone && !isValidUgandanPhone(phoneNumber)) {
      setPhoneError('Enter a valid Ugandan phone number');
      return;
    }
    setPhoneError(null);

    onSubmit({ paymentMethod, phoneNumber: requiresPhone ? phoneNumber : undefined });
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <fieldset style={{ border: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <legend style={{ fontWeight: 700, marginBottom: 'var(--space-2)' }}>How would you like to pay?</legend>
        {methods.map((method) => (
          <label
            key={method.value}
            className={classNames('payment-method-option')}
            style={{
              display: 'flex',
              gap: 'var(--space-3)',
              padding: 'var(--space-4)',
              borderRadius: 'var(--radius-md)',
              border:
                paymentMethod === method.value ? '2px solid var(--color-market-green)' : '1.5px solid var(--color-border)',
              cursor: 'pointer',
            }}
          >
            <input
              type="radio"
              name="paymentMethod"
              value={method.value}
              checked={paymentMethod === method.value}
              onChange={() => setPaymentMethod(method.value)}
              style={{ marginTop: 2 }}
            />
            <div>
              <p style={{ fontWeight: 600 }}>{method.label}</p>
              <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>{method.description}</p>
            </div>
          </label>
        ))}
      </fieldset>

      {requiresPhone && (
        <Input
          label="Mobile money phone number"
          placeholder="07XXXXXXXX"
          value={phoneNumber}
          onChange={(event) => setPhoneNumber(event.target.value)}
          error={phoneError ?? undefined}
          required
        />
      )}

      <Button type="submit" size="lg" fullWidth isLoading={isSubmitting}>
        Review order
      </Button>
    </form>
  );
}
