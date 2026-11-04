import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { useInventory } from '../hooks/useInventory';
import { selectUser } from '../store/slices/authSlice';
import type { InventoryItem } from '../api/inventory.api';

// ─── Inventory Management ─────────────────────────────────────────────────────
//
// This page used to render a hardcoded five-row array — the same honey, coffee
// and polo shirt for every seller — with an "Update Stock" button wired to
// nothing. It did not call useInventory, which in turn called an API module that
// was itself stubbed. Three layers of mock stacked on working backend routes.
//
// Stock is addressed by VARIANT id, not product id: a product with three sizes
// has three independently-stocked SKUs, and there is no product-level stock.

/** Colour and label for a row, from the numbers the server already derived. */
function stockState(item: InventoryItem): { color: string; label: string } {
  if (item.availableStock <= 0) return { color: '#ef4444', label: 'Out of Stock' };
  if (item.isLowStock)          return { color: '#f59e0b', label: 'Low Stock' };
  return { color: '#10b981', label: 'In Stock' };
}

export function InventoryPage() {
  const user = useSelector(selectUser);
  const { inventory, lowStockItems, isLoading, error, updateStock, fetchInventory } = useInventory();

  // The row currently being edited, and the value typed into it.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftStock, setDraftStock] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // Waits for the user: the list endpoint is not seller-scoped server-side, so
    // the id is what filters other sellers' rows out. See inventory.api.ts.
    if (user?.id) void fetchInventory(user.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const beginEdit = (item: InventoryItem) => {
    setEditingId(item.id);
    setDraftStock(String(item.stock));
  };

  const commitEdit = async (item: InventoryItem) => {
    const next = Number(draftStock);
    // A blank or negative box must not be sent as 0 — that would silently zero
    // a seller's stock on a mistyped keystroke.
    if (!Number.isFinite(next) || next < 0) return;
    if (next === item.stock) { setEditingId(null); return; }

    setSaving(true);
    try {
      await updateStock(item.id, next);
      setEditingId(null);
    } finally {
      setSaving(false);
    }
  };

  const th = {
    padding: '12px 16px', textAlign: 'left' as const, fontSize: 12,
    fontWeight: 700, color: '#64748b', textTransform: 'uppercase' as const,
  };
  const td = { padding: '12px 16px', fontSize: 14 };

  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 16 }}>Inventory Management</h1>

      {error && (
        <div role="alert" style={{ background: '#fee2e2', border: '1px solid #ef4444', borderRadius: 8, padding: '12px 16px', marginBottom: 20, color: '#991b1b', fontSize: 14 }}>
          {error}
        </div>
      )}

      {lowStockItems.length > 0 && (
        <div style={{ background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: 8, padding: '12px 16px', marginBottom: 20, color: '#92400e', fontSize: 14, fontWeight: 600 }}>
          ⚠️ {lowStockItems.length} SKU{lowStockItems.length > 1 ? 's are' : ' is'} running low on stock
        </div>
      )}

      <div style={{ background: '#fff', borderRadius: 8, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead style={{ background: '#f8fafc' }}>
            <tr>
              {['Product', 'SKU', 'In Stock', 'Reserved', 'Available', 'Status', 'Action'].map((h) => (
                <th key={h} style={th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={7} style={{ ...td, textAlign: 'center', color: '#64748b' }}>Loading inventory…</td></tr>
            )}

            {!isLoading && inventory.length === 0 && (
              <tr>
                <td colSpan={7} style={{ ...td, textAlign: 'center', color: '#64748b', padding: '32px 16px' }}>
                  No stock yet. Every product you create starts with one SKU — add more options from the product edit page.
                </td>
              </tr>
            )}

            {!isLoading && inventory.map((item: InventoryItem, i: number) => {
              const { color, label } = stockState(item);
              const editing = editingId === item.id;

              return (
                <tr key={item.id} style={{ borderTop: i > 0 ? '1px solid #e2e8f0' : 'none' }}>
                  <td style={{ ...td, fontWeight: 600 }}>{item.product?.name ?? '—'}</td>
                  <td style={{ ...td, fontSize: 13, color: '#64748b' }}><code>{item.sku}</code></td>
                  <td style={{ ...td, fontWeight: 700 }}>
                    {editing ? (
                      <input
                        type="number"
                        min={0}
                        value={draftStock}
                        autoFocus
                        disabled={saving}
                        onChange={(e) => setDraftStock(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') void commitEdit(item);
                          if (e.key === 'Escape') setEditingId(null);
                        }}
                        aria-label={`New stock level for ${item.sku}`}
                        style={{ width: 80, padding: 6, border: '1px solid #cbd5e1', borderRadius: 4 }}
                      />
                    ) : item.stock}
                  </td>
                  {/* Reserved is stock held by carts mid-checkout. Shown because
                      "why can't I sell 5 when it says 5?" is otherwise a support ticket. */}
                  <td style={{ ...td, color: '#64748b' }}>{item.reserved}</td>
                  <td style={{ ...td, fontWeight: 700, color }}>{item.availableStock}</td>
                  <td style={td}>
                    <span style={{ background: `${color}20`, color, padding: '2px 8px', borderRadius: 12, fontSize: 12, fontWeight: 600 }}>
                      {label}
                    </span>
                  </td>
                  <td style={td}>
                    {editing ? (
                      <>
                        <button
                          onClick={() => void commitEdit(item)}
                          disabled={saving}
                          style={{ fontSize: 13, color: '#fff', background: '#10b981', border: 'none', borderRadius: 4, padding: '4px 10px', cursor: saving ? 'default' : 'pointer', marginRight: 6 }}
                        >
                          {saving ? 'Saving…' : 'Save'}
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          disabled={saving}
                          style={{ fontSize: 13, color: '#64748b', background: 'none', border: '1px solid #cbd5e1', borderRadius: 4, padding: '4px 10px', cursor: 'pointer' }}
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => beginEdit(item)}
                        style={{ fontSize: 13, color: '#3b82f6', background: 'none', border: '1px solid #3b82f6', borderRadius: 4, padding: '4px 10px', cursor: 'pointer' }}
                      >
                        Update Stock
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
