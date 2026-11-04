import React, { useMemo, useState } from 'react';
import type { Category, CategoryTreeNode } from '@/types/category.types';
import { buildCategoryTree, MAX_CATEGORY_DEPTH } from '@/utils/categoryTree';
import { Button } from '../common/Button/Button';
import { Badge } from '../common/Badge/Badge';
import { EmptyState } from '../common/EmptyState';

interface CategoryTreeBuilderProps {
  categories: Category[];
  selectedId?: string | null;
  onSelect?: (category: Category) => void;
  onAddChild?: (parent: Category) => void;
  onEdit?: (category: Category) => void;
  onDelete?: (category: Category) => void;
}

const depthColor = (depth: number): string => {
  if (depth >= MAX_CATEGORY_DEPTH) return 'var(--color-danger, #ef4444)';
  if (depth === MAX_CATEGORY_DEPTH - 1) return '#f59e0b';
  return 'var(--color-text-secondary)';
};

const TreeRow: React.FC<{
  node: CategoryTreeNode;
  expanded: Set<string>;
  toggleExpanded: (id: string) => void;
  selectedId?: string | null;
  onSelect?: (category: Category) => void;
  onAddChild?: (parent: Category) => void;
  onEdit?: (category: Category) => void;
  onDelete?: (category: Category) => void;
}> = ({ node, expanded, toggleExpanded, selectedId, onSelect, onAddChild, onEdit, onDelete }) => {
  const hasChildren = node.children.length > 0;
  const isExpanded = expanded.has(node.id);
  const isSelected = selectedId === node.id;
  const atMaxDepth = node.depth >= MAX_CATEGORY_DEPTH;

  return (
    <div>
      <div
        onClick={() => onSelect?.(node)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-2)',
          padding: 'var(--space-2) var(--space-3)',
          paddingLeft: `calc(var(--space-3) + ${(node.depth - 1) * 20}px)`,
          borderBottom: '1px solid var(--color-border)',
          backgroundColor: isSelected ? 'var(--color-bg)' : 'transparent',
          cursor: 'pointer',
        }}
      >
        <span
          onClick={(e) => { e.stopPropagation(); if (hasChildren) toggleExpanded(node.id); }}
          style={{
            width: '16px', display: 'inline-flex', justifyContent: 'center',
            cursor: hasChildren ? 'pointer' : 'default', color: 'var(--color-text-secondary)', userSelect: 'none',
          }}
        >
          {hasChildren ? (isExpanded ? '▾' : '▸') : ''}
        </span>

        <span style={{ flex: 1, fontWeight: node.depth === 1 ? 600 : 500, fontSize: '14px' }}>
          {node.name}
          {!node.isActive && <span style={{ marginLeft: 'var(--space-2)' }}><Badge variant="suspended">inactive</Badge></span>}
        </span>

        <span title="Nesting depth" style={{ fontSize: '11px', fontWeight: 700, color: depthColor(node.depth), border: `1px solid ${depthColor(node.depth)}`, borderRadius: 'var(--radius-full)', padding: '1px 7px' }}>
          L{node.depth}
        </span>

        <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)', minWidth: '52px', textAlign: 'right' }}>
          {node.commissionFeePercent.toFixed(1)}%
        </span>

        <div style={{ display: 'flex', gap: '4px' }} onClick={(e) => e.stopPropagation()}>
          <Button
            size="sm"
            variant="ghost"
            disabled={atMaxDepth}
            title={atMaxDepth ? `Max nesting depth (${MAX_CATEGORY_DEPTH}) reached` : 'Add subcategory'}
            onClick={() => onAddChild?.(node)}
          >
            + Sub
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onEdit?.(node)}>Edit</Button>
          <Button size="sm" variant="ghost" onClick={() => onDelete?.(node)}>Delete</Button>
        </div>
      </div>

      {atMaxDepth && (
        <div style={{
          marginLeft: `calc(var(--space-3) + ${node.depth * 20}px)`,
          fontSize: '11px', color: 'var(--color-danger, #ef4444)', padding: '2px 0 6px',
        }}>
          Maximum nesting depth ({MAX_CATEGORY_DEPTH} levels) reached — cannot add further subcategories here.
        </div>
      )}

      {hasChildren && isExpanded && node.children.map((child) => (
        <TreeRow
          key={child.id}
          node={child}
          expanded={expanded}
          toggleExpanded={toggleExpanded}
          selectedId={selectedId}
          onSelect={onSelect}
          onAddChild={onAddChild}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
};

/**
 * Hierarchical, expandable/collapsible category tree with a per-row depth indicator (capped at
 * MAX_CATEGORY_DEPTH) and inline commission-fee display.
 */
export const CategoryTreeBuilder: React.FC<CategoryTreeBuilderProps> = ({
  categories, selectedId, onSelect, onAddChild, onEdit, onDelete,
}) => {
  const tree = useMemo(() => buildCategoryTree(categories), [categories]);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(tree.map((n) => n.id)));

  const toggleExpanded = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const expandAll = () => {
    const all = new Set<string>();
    const collect = (nodes: CategoryTreeNode[]) => nodes.forEach((n) => { all.add(n.id); collect(n.children); });
    collect(tree);
    setExpanded(all);
  };
  const collapseAll = () => setExpanded(new Set());

  if (categories.length === 0) {
    return <EmptyState icon="🗂️" title="No categories yet" description="Create a root category to start building the catalog tree." />;
  }

  return (
    <div style={{ backgroundColor: 'var(--color-surface)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)' }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: 'var(--space-3) var(--space-4)', borderBottom: '1px solid var(--color-border)',
      }}>
        <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
          Max nesting depth: <strong>{MAX_CATEGORY_DEPTH} levels</strong>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <Button size="sm" variant="ghost" onClick={expandAll}>Expand all</Button>
          <Button size="sm" variant="ghost" onClick={collapseAll}>Collapse all</Button>
        </div>
      </div>
      <div>
        {tree.map((node) => (
          <TreeRow
            key={node.id}
            node={node}
            expanded={expanded}
            toggleExpanded={toggleExpanded}
            selectedId={selectedId}
            onSelect={onSelect}
            onAddChild={onAddChild}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
      </div>
    </div>
  );
};
