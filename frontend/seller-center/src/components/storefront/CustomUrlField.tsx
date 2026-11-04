import React from 'react';
import { Input } from '@/components/common/Input/Input';

interface CustomUrlFieldProps {
  slug: string;
  onChange: (slug: string) => void;
}

const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export const CustomUrlField: React.FC<CustomUrlFieldProps> = ({ slug, onChange }) => {
  const isValid = slug.length === 0 || SLUG_PATTERN.test(slug);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Restrict to lowercase alphanumeric + hyphens as the seller types.
    const sanitized = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '');
    onChange(sanitized);
  };

  return (
    <div>
      <Input
        label="Custom Storefront URL"
        value={slug}
        onChange={handleChange}
        placeholder="my-store-name"
        error={!isValid ? 'Use lowercase letters, numbers, and hyphens only (no leading/trailing/double hyphens).' : undefined}
      />
      <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)', marginTop: '-8px', marginBottom: 'var(--spacing-4)' }}>
        Preview: <strong style={{ color: 'var(--color-text-primary)' }}>muni.com/store/{slug || 'your-slug'}</strong>
      </div>
    </div>
  );
};
