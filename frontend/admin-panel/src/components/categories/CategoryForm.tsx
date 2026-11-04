import React, { useMemo, useState } from 'react';
import { Input } from '../common/Input/Input';
import { Button } from '../common/Button/Button';
import { SlugGeneratorField } from './SlugGeneratorField';
import type { Category } from '@/types/category.types';
import { computeDepth, MAX_CATEGORY_DEPTH, isDescendantOf } from '@/utils/categoryTree';

export interface CategoryFormValues {
  name: string;
  slug: string;
  parentId: string | null;
  sortOrder: number;
  isActive: boolean;
  commissionFeePercent: number;
}

interface CategoryFormProps {
  categories: Category[];
  initial?: Category | null;
  /** Pre-selected parent, used when the form was opened via "Add subcategory". */
  defaultParentId?: string | null;
  onSubmit: (values: CategoryFormValues) => void;
  onCancel: () => void;
  submitting?: boolean;
}

export const CategoryForm: React.FC<CategoryFormProps> = ({
  categories, initial, defaultParentId = null, onSubmit, onCancel, submitting,
}) => {
  const isEdit = !!initial;
  const [name, setName] = useState(initial?.name ?? '');
  const [slug, setSlug] = useState(initial?.slug ?? '');
  const [parentId, setParentId] = useState<string | null>(initial?.parentId ?? defaultParentId);
  const [sortOrder, setSortOrder] = useState(initial?.sortOrder ?? 1);
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);
  const [commissionFeePercent, setCommissionFeePercent] = useState(initial?.commissionFeePercent ?? 5);

  const eligibleParents = useMemo(() => {
    if (!isEdit || !initial) return categories;
    // Prevent choosing self or any of your own descendants as your new parent (would create a cycle).
    return categories.filter((c) => c.id !== initial.id && !isDescendantOf(c.id, initial.id, categories));
  }, [categories, isEdit, initial]);

  const resultingDepth = computeDepth(parentId, categories.filter((c) => c.id !== initial?.id));
  const exceedsMaxDepth = resultingDepth > MAX_CATEGORY_DEPTH;

  const canSubmit = name.trim().length > 0 && slug.trim().length > 0 && !exceedsMaxDepth;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    onSubmit({ name: name.trim(), slug: slug.trim(), parentId, sortOrder, isActive, commissionFeePercent });
  };

  return (
    <form onSubmit={handleSubmit} style={{ backgroundColor: 'var(--color-surface)', borderRadius: 'var(--radius-md)' }}>
      <Input label="Name" required placeholder="e.g. Electronics" value={name} onChange={(e) => setName(e.target.value)} />

      <SlugGeneratorField sourceText={name} value={slug} onChange={setSlug} />

      <div>
        <label style={{ fontSize: '14px', fontWeight: 500, color: 'var(--color-text-primary)', display: 'block', marginBottom: '4px' }}>
          Parent category
        </label>
        <select
          value={parentId ?? ''}
          onChange={(e) => setParentId(e.target.value || null)}
          style={{
            width: '100%', padding: 'var(--space-2)', borderRadius: 'var(--radius-md)',
            border: '1px solid var(--color-border)', backgroundColor: 'var(--color-surface)',
            color: 'var(--color-text-primary)', fontSize: '14px', marginBottom: 'var(--space-3)',
          }}
        >
          <option value="">— None (root category) —</option>
          {eligibleParents.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      <div style={{
        fontSize: '12px', marginBottom: 'var(--space-3)',
        color: exceedsMaxDepth ? 'var(--color-danger, #ef4444)' : 'var(--color-text-secondary)',
      }}>
        Resulting nesting depth: L{resultingDepth} of {MAX_CATEGORY_DEPTH} max.
        {exceedsMaxDepth && ' This exceeds the maximum allowed depth — choose a shallower parent.'}
      </div>

      <Input
        label="Commission fee (%)"
        type="number"
        min={0}
        max={100}
        step={0.1}
        value={commissionFeePercent}
        onChange={(e) => setCommissionFeePercent(Number(e.target.value))}
      />

      <Input
        label="Sort order"
        type="number"
        value={sortOrder}
        onChange={(e) => setSortOrder(Number(e.target.value))}
      />

      <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontSize: '14px', marginBottom: 'var(--space-4)' }}>
        <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
        Active (visible to sellers &amp; buyers)
      </label>

      <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
        <Button type="submit" variant="primary" disabled={!canSubmit || submitting} isLoading={submitting}>
          {isEdit ? 'Save changes' : 'Create category'}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
};
