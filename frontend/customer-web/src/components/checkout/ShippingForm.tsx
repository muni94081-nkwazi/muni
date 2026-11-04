import { useState, type FormEvent } from 'react';
import { Input } from '@/components/common/Input/Input';
import { Button } from '@/components/common/Button/Button';
import { UGANDAN_DISTRICTS } from '@/utils/constants';
import { isRequired, isValidUgandanPhone } from '@/utils/validators';
import type { CreateOrderPayload } from '@/types/order.types';

export type ShippingFormValues = CreateOrderPayload['shipping'];

export interface ShippingFormProps {
  initialValues?: Partial<ShippingFormValues>;
  onSubmit: (values: ShippingFormValues) => void;
}

export function ShippingForm({ initialValues, onSubmit }: ShippingFormProps) {
  const [address, setAddress] = useState(initialValues?.address ?? '');
  const [city, setCity] = useState(initialValues?.city ?? 'Kampala');
  const [district, setDistrict] = useState(initialValues?.district ?? 'Kampala');
  const [phone, setPhone] = useState(initialValues?.phone ?? '');
  const [notes, setNotes] = useState(initialValues?.notes ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});

  function validate(): boolean {
    const next: Record<string, string> = {};
    if (!isRequired(address)) next.address = 'Delivery address is required';
    if (!isRequired(city)) next.city = 'City is required';
    if (!isValidUgandanPhone(phone)) next.phone = 'Enter a valid Ugandan phone number';
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!validate()) return;
    onSubmit({ address, city, district, phone, notes: notes || undefined });
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <Input
        label="Delivery address"
        placeholder="Plot 12, Ntinda Road"
        value={address}
        onChange={(event) => setAddress(event.target.value)}
        error={errors.address}
        required
      />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
        <Input
          label="City / Town"
          value={city}
          onChange={(event) => setCity(event.target.value)}
          error={errors.city}
          required
        />
        <div>
          <label style={{ fontSize: 'var(--text-sm)', fontWeight: 600, display: 'block', marginBottom: 'var(--space-1)' }}>
            District
          </label>
          <select
            value={district}
            onChange={(event) => setDistrict(event.target.value)}
            style={{
              width: '100%',
              padding: 'var(--space-3)',
              borderRadius: 'var(--radius-md)',
              border: '1.5px solid var(--color-border)',
            }}
          >
            {UGANDAN_DISTRICTS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>
      </div>
      <Input
        label="Phone number"
        placeholder="07XXXXXXXX"
        value={phone}
        onChange={(event) => setPhone(event.target.value)}
        error={errors.phone}
        hint="We'll use this to coordinate delivery and mobile money payment"
        required
      />
      <div>
        <label style={{ fontSize: 'var(--text-sm)', fontWeight: 600, display: 'block', marginBottom: 'var(--space-1)' }}>
          Delivery notes (optional)
        </label>
        <textarea
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          rows={3}
          placeholder="Gate code, landmark, preferred delivery time..."
          style={{
            width: '100%',
            padding: 'var(--space-3)',
            borderRadius: 'var(--radius-md)',
            border: '1.5px solid var(--color-border)',
            fontFamily: 'inherit',
            resize: 'vertical',
          }}
        />
      </div>
      <Button type="submit" size="lg" fullWidth>
        Continue to payment
      </Button>
    </form>
  );
}
