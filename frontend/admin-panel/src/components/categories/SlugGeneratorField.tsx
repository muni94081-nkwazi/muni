import React, { useEffect, useRef, useState } from 'react';
import { Input } from '../common/Input/Input';
import { slugify } from '@/utils/categoryTree';

interface SlugGeneratorFieldProps {
  /** The source text (e.g. category name) the slug auto-derives from while the admin hasn't hand-edited it. */
  sourceText: string;
  value: string;
  onChange: (slug: string) => void;
  label?: string;
  error?: string;
}

/**
 * A slug input that live-generates from `sourceText` via slugify() as the admin types the name,
 * but "unlocks" into a freely-editable field the moment the admin types into it directly —
 * at that point it stops following the source text until the field is cleared.
 */
export const SlugGeneratorField: React.FC<SlugGeneratorFieldProps> = ({
  sourceText,
  value,
  onChange,
  label = 'Slug',
  error,
}) => {
  const [manuallyEdited, setManuallyEdited] = useState(false);
  const lastAutoValue = useRef('');

  useEffect(() => {
    if (manuallyEdited) return;
    const generated = slugify(sourceText);
    lastAutoValue.current = generated;
    onChange(generated);
    // Intentionally omit onChange from deps — it's a setter passed fresh each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceText, manuallyEdited]);

  const handleInput = (next: string) => {
    onChange(next);
    if (next.trim() === '') {
      // Cleared field re-enables auto-generation from the name.
      setManuallyEdited(false);
      return;
    }
    if (next !== lastAutoValue.current) {
      setManuallyEdited(true);
    }
  };

  return (
    <div>
      <Input
        label={label}
        value={value}
        onChange={(e) => handleInput(e.target.value)}
        placeholder="auto-generated-from-name"
        error={error}
      />
      <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginTop: '-8px', marginBottom: 'var(--space-3)' }}>
        {manuallyEdited ? 'Edited manually — clear the field to resume auto-generation.' : 'Auto-generated from the name. Edit to override.'}
      </div>
    </div>
  );
};
