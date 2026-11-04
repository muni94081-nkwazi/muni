import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminProductCreateApi, type AdminProductFormValues } from '@/api/products.api';
import { mediaApi, MediaUploadError } from '@/api/media.api';
import { ROUTES } from '@/router/routes';

// ─── Admin/Owner product creation ─────────────────────────────────────────────
//
// The Admin Panel could moderate products but never create one, so an owner
// listing their own stock had to go and use Seller Center.
//
// This posts to the same /seller/products endpoint sellers use — see the note
// in products.api.ts. Two consequences are stated on the form rather than
// hidden, because they are the backend's rules and not this screen's choice:
// the admin who creates a listing owns it, and it still goes through the
// approval queue like any other.

const FIELD: React.CSSProperties = {
  width: '100%',
  padding: '9px 12px',
  border: '1px solid #d5dae2',
  borderRadius: 6,
  fontSize: 14,
  fontFamily: 'inherit',
};

const LABEL: React.CSSProperties = {
  display: 'block',
  fontSize: 13,
  fontWeight: 600,
  marginBottom: 6,
  color: '#334155',
};

const CARD: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e2e8f0',
  borderRadius: 10,
  padding: 20,
  marginBottom: 16,
};

const EMPTY: AdminProductFormValues = {
  name: '',
  description: '',
  price: '',
  compareAtPrice: '',
  sku: '',
  stock: '',
  category: '',
  brand: '',
  tags: '',
  imageUrls: [],
};

export function ProductCreatePage() {
  const navigate = useNavigate();
  const fileInput = useRef<HTMLInputElement>(null);

  const [values, setValues] = useState<AdminProductFormValues>(EMPTY);
  const [images, setImages] = useState<string[]>([]);
  const [urlDraft, setUrlDraft] = useState('');
  const [uploading, setUploading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof AdminProductFormValues>(key: K, value: AdminProductFormValues[K]) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  // ── Local files ────────────────────────────────────────────────────────────
  const onFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setError(null);
    setUploading(`Uploading 0 of ${files.length}…`);

    const { urls, errors } = await mediaApi.uploadImages(Array.from(files), (done, total) =>
      setUploading(`Uploading ${done} of ${total}…`),
    );

    setImages((prev) => [...prev, ...urls]);
    setUploading(null);
    if (errors.length > 0) setError(errors.join(' '));
    if (fileInput.current) fileInput.current.value = '';
  };

  // ── Image by URL ───────────────────────────────────────────────────────────
  const addUrl = () => {
    const candidate = urlDraft.trim();
    if (!candidate) return;

    // The same rule product-service enforces, applied here so the mistake is
    // caught while the admin is looking at the field rather than as a 422 on
    // submit. `data:` and `javascript:` are refused by the server regardless.
    let parsed: URL;
    try {
      parsed = new URL(candidate);
    } catch {
      setError('That is not a valid URL.');
      return;
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      setError('Image URLs must start with http:// or https://.');
      return;
    }

    setError(null);
    setImages((prev) => [...prev, candidate]);
    setUrlDraft('');
  };

  const removeImage = (url: string) => setImages((prev) => prev.filter((i) => i !== url));

  const submit = async (status: 'DRAFT' | 'PENDING_APPROVAL') => {
    if (saving) return;
    setError(null);

    if (!values.name.trim()) return setError('Product name is required.');
    if (!String(values.price).trim() || Number(values.price) <= 0) {
      return setError('Enter a price greater than zero.');
    }

    setSaving(true);
    try {
      await adminProductCreateApi.create({ ...values, imageUrls: images, status });
      navigate(ROUTES.PRODUCTS);
    } catch (err) {
      const body = (err as { response?: { data?: { message?: string; issues?: unknown[] } } })
        .response?.data;
      setError(
        body?.issues
          ? `The server rejected this listing: ${JSON.stringify(body.issues).slice(0, 300)}`
          : body?.message ?? 'Could not create the product. Please try again.',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ maxWidth: 820, paddingBottom: 40 }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0f172a' }}>Add product</h1>
        <p style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>
          This listing will be owned by your account and goes through the same review queue as a
          seller&apos;s. Products cannot be created on another seller&apos;s behalf.
        </p>
      </div>

      {error && (
        <div
          role="alert"
          style={{
            background: '#fef2f2',
            border: '1px solid #fecaca',
            color: '#991b1b',
            padding: '10px 14px',
            borderRadius: 8,
            marginBottom: 16,
            fontSize: 13,
          }}
        >
          {error}
        </div>
      )}

      <section style={CARD}>
        <label style={LABEL} htmlFor="name">Product name *</label>
        <input
          id="name" style={FIELD} value={values.name}
          onChange={(e) => set('name', e.target.value)}
        />

        <label style={{ ...LABEL, marginTop: 16 }} htmlFor="description">Description</label>
        <textarea
          id="description" rows={4} style={{ ...FIELD, resize: 'vertical' }}
          value={values.description}
          onChange={(e) => set('description', e.target.value)}
        />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16 }}>
          <div>
            <label style={LABEL} htmlFor="category">Category</label>
            <input
              id="category" style={FIELD} value={values.category}
              placeholder="Category id"
              onChange={(e) => set('category', e.target.value)}
            />
          </div>
          <div>
            <label style={LABEL} htmlFor="brand">Brand</label>
            <input
              id="brand" style={FIELD} value={values.brand}
              onChange={(e) => set('brand', e.target.value)}
            />
          </div>
        </div>

        <label style={{ ...LABEL, marginTop: 16 }} htmlFor="tags">Tags</label>
        <input
          id="tags" style={FIELD} value={values.tags}
          placeholder="Comma separated, e.g. kitchen, steel, gift"
          onChange={(e) => set('tags', e.target.value)}
        />
      </section>

      <section style={CARD}>
        <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 14, color: '#0f172a' }}>
          Price and stock
        </h2>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <label style={LABEL} htmlFor="price">Price (UGX) *</label>
            <input
              id="price" type="number" min={0} style={FIELD} value={values.price}
              onChange={(e) => set('price', e.target.value)}
            />
          </div>
          <div>
            <label style={LABEL} htmlFor="compareAtPrice">Compare-at price (UGX)</label>
            <input
              id="compareAtPrice" type="number" min={0} style={FIELD}
              value={values.compareAtPrice}
              onChange={(e) => set('compareAtPrice', e.target.value)}
            />
          </div>
          <div>
            <label style={LABEL} htmlFor="sku">SKU</label>
            <input
              id="sku" style={FIELD} value={values.sku}
              placeholder="Generated from the name if left blank"
              onChange={(e) => set('sku', e.target.value)}
            />
          </div>
          <div>
            <label style={LABEL} htmlFor="stock">Stock</label>
            <input
              id="stock" type="number" min={0} style={FIELD} value={values.stock}
              onChange={(e) => set('stock', e.target.value)}
            />
          </div>
        </div>

        <p style={{ fontSize: 12, color: '#64748b', marginTop: 12 }}>
          These create the listing&apos;s first variant. Further variants are managed on the
          product once it exists.
        </p>
      </section>

      <section style={CARD}>
        <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 14, color: '#0f172a' }}>
          Images
        </h2>

        <label style={LABEL} htmlFor="file">From this computer</label>
        <input
          id="file" ref={fileInput} type="file" accept="image/*" multiple
          disabled={!!uploading}
          onChange={(e) => void onFiles(e.target.files)}
          style={{ fontSize: 13 }}
        />
        {uploading && (
          <p style={{ fontSize: 12, color: '#64748b', marginTop: 8 }}>{uploading}</p>
        )}

        <label style={{ ...LABEL, marginTop: 18 }} htmlFor="imageUrl">Or paste an image URL</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            id="imageUrl" style={FIELD} value={urlDraft}
            placeholder="https://…"
            onChange={(e) => setUrlDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addUrl(); } }}
          />
          <button
            type="button" onClick={addUrl}
            style={{
              padding: '9px 18px', borderRadius: 6, border: '1px solid #d5dae2',
              background: '#f8fafc', fontWeight: 600, fontSize: 13, cursor: 'pointer',
            }}
          >
            Add
          </button>
        </div>

        {images.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 16 }}>
            {images.map((url) => (
              <div key={url} style={{ position: 'relative' }}>
                <img
                  src={url} alt=""
                  style={{
                    width: 84, height: 84, objectFit: 'cover',
                    borderRadius: 6, border: '1px solid #e2e8f0',
                  }}
                />
                <button
                  type="button" onClick={() => removeImage(url)}
                  aria-label="Remove image"
                  style={{
                    position: 'absolute', top: -6, right: -6, width: 22, height: 22,
                    borderRadius: '50%', border: '1px solid #e2e8f0', background: '#fff',
                    cursor: 'pointer', lineHeight: 1, fontSize: 13,
                  }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <div style={{ display: 'flex', gap: 12 }}>
        <button
          type="button" disabled={saving || !!uploading}
          onClick={() => void submit('PENDING_APPROVAL')}
          style={{
            padding: '11px 24px', borderRadius: 8, border: 'none',
            background: '#0f172a', color: '#fff', fontWeight: 700, fontSize: 14,
            cursor: saving ? 'default' : 'pointer',
          }}
        >
          {saving ? 'Submitting…' : 'Submit for review'}
        </button>
        <button
          type="button" disabled={saving || !!uploading}
          onClick={() => void submit('DRAFT')}
          style={{
            padding: '11px 24px', borderRadius: 8, border: '1px solid #d5dae2',
            background: '#fff', fontWeight: 600, fontSize: 14, cursor: 'pointer',
          }}
        >
          Save as draft
        </button>
        <button
          type="button" onClick={() => navigate(ROUTES.PRODUCTS)}
          style={{
            padding: '11px 18px', borderRadius: 8, border: 'none',
            background: 'transparent', color: '#64748b', fontWeight: 600, fontSize: 14,
            cursor: 'pointer',
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export default ProductCreatePage;

// Re-exported so a caller can distinguish an upload rejection from a save error.
export { MediaUploadError };
