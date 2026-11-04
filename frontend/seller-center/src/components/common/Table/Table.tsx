import React, { ReactNode, useMemo, useState } from 'react';
import { Pagination } from '../Pagination';

interface Column<T> {
  key: string;
  label: string;
  render?: (item: T) => ReactNode;
  sortAccessor?: (row: T) => string | number;
  hideByDefault?: boolean;
}

interface TableProps<T> {
  columns: Column<T>[];
  data: T[];
  isLoading?: boolean;
  emptyMessage?: string;
  sortable?: boolean;
  searchable?: boolean;
  searchPlaceholder?: string;
  pageSize?: number;
  selectable?: boolean;
  selectedIds?: string[];
  onSelectionChange?: (ids: string[]) => void;
  getRowId?: (row: T) => string;
  enableColumnToggle?: boolean;
  onRowClick?: (row: T) => void;
}

type SortDirection = 'asc' | 'desc' | null;

export const Table = <T extends Record<string, any>>({
  columns,
  data,
  isLoading,
  emptyMessage = 'No records found.',
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
}: TableProps<T>) => {
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--spacing-3)', gap: 'var(--spacing-3)' }}>
          {searchable ? (
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder={searchPlaceholder}
              style={{
                padding: 'var(--spacing-2) var(--spacing-3)', borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--color-border)', fontSize: '14px', minWidth: '220px',
              }}
            />
          ) : <div />}
          {enableColumnToggle && (
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setColumnMenuOpen((o) => !o)}
                style={{ padding: 'var(--spacing-2) var(--spacing-3)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', background: 'var(--color-surface)', cursor: 'pointer', fontSize: '13px' }}
              >
                Columns ▾
              </button>
              {columnMenuOpen && (
                <div style={{
                  position: 'absolute', right: 0, top: '100%', marginTop: 4, background: 'var(--color-surface)',
                  border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', boxShadow: 'var(--shadow-md)',
                  padding: 'var(--spacing-2)', zIndex: 20, minWidth: '180px',
                }}>
                  {columns.map((col) => (
                    <label key={col.key} style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-2)', padding: 'var(--spacing-1) var(--spacing-2)', fontSize: '13px', cursor: 'pointer' }}>
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
      <div style={{ overflowX: 'auto', width: '100%', backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #e0e0e0' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead style={{ backgroundColor: '#f8f9fa', borderBottom: '2px solid #e0e0e0' }}>
            <tr>
              {selectable && (
                <th style={{ padding: '12px 16px', width: 36 }}>
                  <input type="checkbox" checked={allVisibleSelected} onChange={toggleSelectAll} />
                </th>
              )}
              {visibleColumns.map((col) => (
                <th
                  key={col.key}
                  onClick={() => handleSort(col)}
                  style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: '#5f6368', cursor: sortable ? 'pointer' : 'default', userSelect: 'none', whiteSpace: 'nowrap' }}
                >
                  {col.label}
                  {sortable && sortKey === col.key && (sortDir === 'asc' ? ' ▲' : sortDir === 'desc' ? ' ▼' : '')}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #e0e0e0' }}>
                  {visibleColumns.map((col) => (
                    <td key={col.key} style={{ padding: '12px 16px' }}>
                      <div style={{ width: '100%', height: '20px', backgroundColor: '#f1f3f4', animation: 'pulse 1.5s infinite' }} />
                    </td>
                  ))}
                </tr>
              ))
            ) : paginated.length === 0 ? (
              <tr>
                <td colSpan={visibleColumns.length + (selectable ? 1 : 0)} style={{ padding: '24px', textAlign: 'center', color: '#5f6368' }}>
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              paginated.map((row, i) => (
                <tr
                  key={resolveId(row) ?? i}
                  onClick={() => onRowClick?.(row)}
                  style={{ borderBottom: '1px solid #e0e0e0', cursor: onRowClick ? 'pointer' : 'default' }}
                >
                  {selectable && (
                    <td style={{ padding: '12px 16px' }} onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={selectedIds.includes(resolveId(row))} onChange={() => toggleSelectRow(row)} />
                    </td>
                  )}
                  {visibleColumns.map((col) => (
                    <td key={col.key} style={{ padding: '12px 16px', color: '#202124' }}>
                      {col.render ? col.render(row) : row[col.key]}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
        <style>{`
          @keyframes pulse {
            0% { opacity: 0.6; }
            50% { opacity: 1; }
            100% { opacity: 0.6; }
          }
        `}</style>
      </div>
      {pageSize && sorted.length > pageSize && (
        <Pagination currentPage={page} lastPage={lastPage} onPageChange={setPage} />
      )}
    </div>
  );
};
