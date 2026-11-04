import React, { useMemo } from 'react';
import { Table } from '../common/Table/Table';
import { Badge } from '../common/Badge/Badge';
import { useAppSelector } from '@/store/hooks/useAppSelector';
import { computeDepth } from '@/utils/categoryTree';
import type { Category } from '@/types/category.types';

interface CategoryRow extends Category {
  depth: number;
  parentName: string;
}

/** Flat, searchable/sortable table view of every category — a companion to the tree view above it. */
export const CategoryList: React.FC = () => {
  const { categories, loading } = useAppSelector((s) => s.categories);

  const rows: CategoryRow[] = useMemo(() => {
    const byId = new Map(categories.map((c) => [c.id, c]));
    return categories.map((c) => ({
      ...c,
      depth: computeDepth(c.parentId, categories),
      parentName: c.parentId ? byId.get(c.parentId)?.name ?? '—' : '—',
    }));
  }, [categories]);

  const columns = [
    { key: 'name', label: 'Name', render: (r: CategoryRow) => (
      <span style={{ paddingLeft: `${(r.depth - 1) * 14}px` }}>{r.name}</span>
    ) },
    { key: 'slug', label: 'Slug' },
    { key: 'parentName', label: 'Parent' },
    { key: 'depth', label: 'Depth', sortAccessor: (r: CategoryRow) => r.depth, render: (r: CategoryRow) => `L${r.depth}` },
    {
      key: 'commissionFeePercent', label: 'Commission',
      sortAccessor: (r: CategoryRow) => r.commissionFeePercent,
      render: (r: CategoryRow) => `${r.commissionFeePercent.toFixed(1)}%`,
    },
    {
      key: 'isActive', label: 'Status',
      render: (r: CategoryRow) => <Badge variant={r.isActive ? 'active' : 'suspended'}>{r.isActive ? 'active' : 'inactive'}</Badge>,
    },
  ];

  return (
    <Table
      columns={columns}
      data={rows}
      isLoading={loading}
      searchable
      searchPlaceholder="Search categories…"
      sortable
      pageSize={10}
      emptyMessage="No categories found."
    />
  );
};
