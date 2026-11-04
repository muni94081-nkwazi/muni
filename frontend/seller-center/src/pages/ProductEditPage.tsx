import { useState, useEffect, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useProducts } from '../hooks/useProducts';
import { productsApi } from '../api/products.api';
import type { ProductStatus } from '../types/product.types';
import { VariantCreationUI } from '../components/products/VariantCreationUI';

const STATUS_NOTE: Partial<Record<ProductStatus, { bg: string; fg: string; text: string }>> = {
  PENDING_APPROVAL: {
    bg: '#fef7e0', fg: '#b06000',
    text: 'This listing is awaiting admin review and is not visible to customers yet.',
  },
  ACTIVE: {
    bg: '#e6f4ea', fg: '#137333',
    text: 'This listing is live. Editing the name, price, description, images or category sends it back for review.',
  },
  ARCHIVED: {
    bg: '#f1f3f4', fg: '#3c4043',
    text: 'This listing is archived and hidden from the storefront.',
  },
};

export function ProductEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { currentProduct, fetchProductById, updateProduct, error } = useProducts();

  const [form, setForm] = useState({
    name: '', price: '', category: '', description: '', imageUrls: '', tags: '', brand: '',
  });
  const [isSaving, setIsSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    if (id) fetchProductById(id);
  }, [id, fetchProductById]);

  // Same category source as the create form — a raw cuid text box would be
  // guesswork for the seller and a dangling reference when guessed wrong.
  useEffect(() => {
    let cancelled = false;
    productsApi
      .getCategories()
      .then((rows) => { if (!cancelled) setCategories(Array.isArray(rows) ? rows : []); })
      .catch(() => { if (!cancelled) setCategories([]); });
    return () => { cancelled = true; };
  }, []);

  // Populate once the real product arrives. Guarded on id so a stale
  // currentProduct from a previous page does not overwrite this form.
  useEffect(() => {
    if (!currentProduct || currentProduct.id !== id) return;
    setForm({
      name:        currentProduct.name ?? '',
      price:       String(currentProduct.price ?? ''),
      category:    currentProduct.categoryId ?? '',
      description: currentProduct.description ?? '',
      imageUrls:   (currentProduct.imageUrls ?? []).join(', '),
      tags:        '',
      brand:       '',
    });
    setLoaded(true);
  }, [currentProduct, id]);

  function set(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!id) return;
    setIsSaving(true);
    const result: any = await updateProduct(id, {
      name:        form.name,
      price:       form.price,
      category:    form.category || undefined,
      description: form.description,
      imageUrls:   form.imageUrls,
      tags:        form.tags,
      brand:       form.brand || undefined,
    });
    setIsSaving(false);
    // Only leave the page if the save actually succeeded — otherwise the error
    // banner would never be seen.
    if (!result?.error) navigate('/products');
  }

  const inputStyle = { width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 14, boxSizing: 'border-box' as const };
  const labelStyle = { display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4, color: '#0f172a' } as const;

  const note = currentProduct ? STATUS_NOTE[currentProduct.status] : undefined;

  return (
    <div style={{ maxWidth: 640 }}>
      <button onClick={() => navigate('/products')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#3b82f6', fontSize: 14, marginBottom: 16 }}>← Back to Products</button>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24 }}>Edit Product</h1>

      {/* The rejection reason is the one thing a declined seller needs, so it
          leads the page rather than sitting in a table cell. */}
      {currentProduct?.status === 'REJECTED' && (
        <div style={{ background: '#fce8e6', color: '#c5221f', padding: '12px 16px', borderRadius: 6, marginBottom: 16, fontSize: 14 }}>
          <strong>Rejected by moderation.</strong>
          <div style={{ marginTop: 4 }}>{currentProduct.rejectionReason || 'No reason was recorded.'}</div>
          <div style={{ marginTop: 8, fontSize: 13 }}>Fix the issue and save — the listing returns to the review queue.</div>
        </div>
      )}

      {note && (
        <div style={{ background: note.bg, color: note.fg, padding: '12px 16px', borderRadius: 6, marginBottom: 16, fontSize: 14 }}>
          {note.text}
        </div>
      )}

      {error && (
        <div style={{ background: '#fce8e6', color: '#c5221f', padding: '12px 16px', borderRadius: 6, marginBottom: 16, fontSize: 14 }}>
          {error}
        </div>
      )}

      {!loaded ? (
        <div style={{ padding: 24, color: '#5f6368' }}>Loading product…</div>
      ) : (
        <form onSubmit={handleSubmit} style={{ background: '#fff', padding: 24, borderRadius: 8, border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div><label style={labelStyle}>Product Name *</label><input value={form.name} onChange={(e) => set('name', e.target.value)} required style={inputStyle} /></div>
          <div><label style={labelStyle}>Price (UGX) *</label><input type="number" value={form.price} onChange={(e) => set('price', e.target.value)} required style={inputStyle} /></div>
          <div><label style={labelStyle}>Brand</label><input value={form.brand} onChange={(e) => set('brand', e.target.value)} style={inputStyle} /></div>
          <div>
            <label style={labelStyle}>Category</label>
            <select value={form.category} onChange={(e) => set('category', e.target.value)} style={inputStyle}>
              <option value="">Select category</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div><label style={labelStyle}>Description</label><textarea value={form.description} onChange={(e) => set('description', e.target.value)} rows={4} style={inputStyle} /></div>
          <div><label style={labelStyle}>Image URLs (comma separated)</label><input value={form.imageUrls} onChange={(e) => set('imageUrls', e.target.value)} style={inputStyle} /></div>
          <div><label style={labelStyle}>Tags (comma separated)</label><input value={form.tags} onChange={(e) => set('tags', e.target.value)} style={inputStyle} /></div>

          <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
            <button type="submit" disabled={isSaving} style={{ background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, padding: '10px 24px', fontWeight: 600, cursor: 'pointer', opacity: isSaving ? 0.7 : 1 }}>{isSaving ? 'Saving...' : 'Save Changes'}</button>
            <button type="button" onClick={() => navigate('/products')} style={{ background: 'none', border: '1px solid #e2e8f0', borderRadius: 6, padding: '10px 24px', fontSize: 14, cursor: 'pointer' }}>Cancel</button>
          </div>
        </form>
      )}

      {/* Outside the form on purpose. SKUs save immediately through their own
          endpoints, so nesting them inside a <form> would put buttons that
          already persisted their change next to a "Save Changes" that does not
          cover them — and a stray Enter would submit the product edit.

          Editing stock also does NOT send a listing back for moderation:
          RE_MODERATION_FIELDS in product.service.ts covers name, price, images
          and description, deliberately not stock. Restocking an approved
          product should not pull it off the storefront. */}
      {loaded && id && (
        <VariantCreationUI productId={id} basePrice={Number(form.price) || undefined} />
      )}
    </div>
  );
}
