import React, { useMemo, useState } from 'react';
import { Pagination } from '../Pagination';

interface Column<T> {
  key: string;
  label: string;
  render?: (row: T) => React.ReactNode;
  sortAccessor?: (row: T) => string | number;
  hideByDefault?: boolean;
}

interface TableProps<T> {
  columns: Column<T>[];
  data: T[];
  isLoading?: boolean;
  emptyMessage?: string;
  /** Enables clickable column-header sorting. */
  sortable?: boolean;
  /** Shows a built-in search box that filters across all visible column values. */
  searchable?: boolean;
  searchPlaceholder?: string;
  /** Enables client-side pagination at this page size. */
  pageSize?: number;
  /** Shows row checkboxes for batch actions. */
  selectable?: boolean;
  selectedIds?: string[];
  onSelectionChange?: (ids: string[]) => void;
  getRowId?: (row: T) => string;
  /** Shows a column-visibility toggle menu. */
  enableColumnToggle?: boolean;
  onRowClick?: (row: T) => void;
}

type SortDirection = 'asc' | 'desc' | null;

export function Table<T extends Record<string, any>>({
  columns,
  data,
  isLoading,
  emptyMessage = 'No data available',
  sortable = false,
  searchable = false,
  searchPlaceholder = 'Search…',
  pageSize,
  selectable = false,
  selectedIds = [],
  onSelectionChange,
  getRowId,
  enableColumnToggle = false,
  onRowClick,
}: TableProps<T>) {
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDirection>(null);
  const [page, setPage] = useState(1);
  const [columnMenuOpen, setColumnMenuOpen] = useState(false);
  const [hiddenCols, setHiddenCols] = useState<Set<string>>(
    () => new Set(columns.filter((c) => c.hideByDefault).map((c) => c.key))
  );

  const resolveId = (row: T): string => (getRowId ? getRowId(row) : String(row.id));

  const filtered = useMemo(() => {
    if (!searchable || !search.trim()) return data;
    const q = search.trim().toLowerCase();
    return data.filter((row) =>
      columns.some((col) => {
        const val = col.sortAccessor ? col.sortAccessor(row) : row[col.key];
        return val != null && String(val).toLowerCase().includes(q);
      })
    );
  }, [data, search, searchable, columns]);

  const sorted = useMemo(() => {
    if (!sortable || !sortKey || !sortDir) return filtered;
    const col = columns.find((c) => c.key === sortKey);
    if (!col) return filtered;
    const accessor = col.sortAccessor ?? ((row: T) => row[col.key]);
    const copy = [...filtered];
    copy.sort((a, b) => {
      const av = accessor(a);
      const bv = accessor(b);
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === 'number' && typeof bv === 'number') return av - bv;
      return String(av).localeCompare(String(bv));
    });
    if (sortDir === 'desc') copy.reverse();
    return copy;
  }, [filtered, sortable, sortKey, sortDir, columns]);

  const paginated = useMemo(() => {
    if (!pageSize) return sorted;
    const start = (page - 1) * pageSize;
    return sorted.slice(start, start + pageSize);
  }, [sorted, pageSize, page]);

  const lastPage = pageSize ? Math.max(1, Math.ceil(sorted.length / pageSize)) : 1;
  const visibleColumns = columns.filter((c) => !hiddenCols.has(c.key));

  const handleSort = (col: Column<T>) => {
    if (!sortable) return;
    if (sortKey !== col.key) {
      setSortKey(col.key);
      setSortDir('asc');
    } else if (sortDir === 'asc') {
      setSortDir('desc');
    } else {
      setSortKey(null);
      setSortDir(null);
    }
  };

  const allVisibleSelected = paginated.length > 0 && paginated.every((row) => selectedIds.includes(resolveId(row)));

  const toggleSelectAll = () => {
    if (!onSelectionChange) return;
    if (allVisibleSelected) {
      const pageIds = new Set(paginated.map(resolveId));
      onSelectionChange(selectedIds.filter((id) => !pageIds.has(id)));
    } else {
      const pageIds = paginated.map(resolveId);
      onSelectionChange(Array.from(new Set([...selectedIds, ...pageIds])));
    }
  };

  const toggleSelectRow = (row: T) => {
    if (!onSelectionChange) return;
    const id = resolveId(row);
    if (selectedIds.includes(id)) {
      onSelectionChange(selectedIds.filter((x) => x !== id));
    } else {
      onSelectionChange([...selectedIds, id]);
    }
  };

  const toggleColumn = (key: string) => {
    setHiddenCols((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div>
      {(searchable || enableColumnToggle) && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-3)', gap: 'var(--space-3)' }}>
          {searchable ? (
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder={searchPlaceholder}
              style={{
                padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--color-border)', fontSize: '14px', minWidth: '220px',
              }}
            />
          ) : <div />}
          {enableColumnToggle && (
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setColumnMenuOpen((o) => !o)}
                style={{ padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', background: 'var(--color-surface)', cursor: 'pointer', fontSize: '13px' }}
              >
                Columns ▾
              </button>
              {columnMenuOpen && (
                <div style={{
                  position: 'absolute', right: 0, top: '100%', marginTop: 4, background: 'var(--color-surface)',
                  border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', boxShadow: 'var(--shadow-md)',
                  padding: 'var(--space-2)', zIndex: 20, minWidth: '180px',
                }}>
                  {columns.map((col) => (
                    <label key={col.key} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: 'var(--space-1) var(--space-2)', fontSize: '13px', cursor: 'pointer' }}>
                      <input type="checkbox" checked={!hiddenCols.has(col.key)} onChange={() => toggleColumn(col.key)} />
                      {col.label}
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
      <div style={{ overflowX: 'auto', backgroundColor: 'var(--color-surface)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--color-border)', backgroundColor: 'var(--color-bg)' }}>
              {selectable && (
                <th style={{ padding: 'var(--space-3) var(--space-4)', width: 36 }}>
                  <input type="checkbox" checked={allVisibleSelected} onChange={toggleSelectAll} />
                </th>
              )}
              {visibleColumns.map((col) => (
                <th
                  key={col.key}
                  onClick={() => handleSort(col)}
                  style={{
                    padding: 'var(--space-3) var(--space-4)', color: 'var(--color-text-secondary)', fontWeight: 600,
                    cursor: sortable ? 'pointer' : 'default', userSelect: 'none', whiteSpace: 'nowrap',
                  }}
                >
                  {col.label}
                  {sortable && sortKey === col.key && (sortDir === 'asc' ? ' ▲' : sortDir === 'desc' ? ' ▼' : '')}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={visibleColumns.length + (selectable ? 1 : 0)} style={{ padding: 'var(--space-6)', textAlign: 'center' }}>Loading...</td>
              </tr>
            ) : paginated.length === 0 ? (
              <tr>
                <td colSpan={visibleColumns.length + (selectable ? 1 : 0)} style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              paginated.map((row, rowIndex) => (
                <tr
                  key={resolveId(row) ?? rowIndex}
                  onClick={() => onRowClick?.(row)}
                  style={{ borderBottom: '1px solid var(--color-border)', cursor: onRowClick ? 'pointer' : 'default' }}
                >
                  {selectable && (
                    <td style={{ padding: 'var(--space-3) var(--space-4)' }} onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={selectedIds.includes(resolveId(row))} onChange={() => toggleSelectRow(row)} />
                    </td>
                  )}
                  {visibleColumns.map((col) => (
                    <td key={col.key} style={{ padding: 'var(--space-3) var(--space-4)' }}>
                      {col.render ? col.render(row) : row[col.key]}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {pageSize && sorted.length > pageSize && (
        <Pagination currentPage={page} lastPage={lastPage} onPageChange={setPage} />
      )}
    </div>
  );
}
