import React, { useCallback, useEffect, useState } from 'react';
import { variantsApi, type Variant } from '../../api/variants.api';
import { mediaApi } from '../../api/media.api';

// ─── SKU-level variant management ─────────────────────────────────────────────
//
// This component was a mockup: two hardcoded Samsung SKUs in local state, an
// "+ Add Variant" button that appended to a React array, and no import anywhere
// in the app — it was never rendered. The endpoints it needed already existed.
//
// Now backed by product-service:
//   GET    /api/v1/products/:id/variants
//   POST   /api/v1/products/:id/variants
//   PUT    /api/v1/products/:id/variants/:variantId
//   DELETE /api/v1/products/:id/variants/:variantId
//
// Attributes are free-form on the server (`Record<string, string>`), and the
// form now matches that: named option rows, so a phone can list Storage and a
// shirt can list Size without either borrowing the other's vocabulary.

/**
 * Images for the variant being drafted.
 *
 * Uploads through mediaApi — the same path the product gallery uses — so what
 * is stored is a real media-service URL. CreateVariantSchema takes
 * `images: z.array(z.string().url())`, and product-service rejects `data:` and
 * `javascript:` URIs, so an inline base64 preview could not be persisted even
 * if this pasted one in.
 */
function VariantImagePicker({
  images,
  disabled,
  onChange,
}: {
  images: string[];
  disabled: boolean;
  onChange: (images: string[]) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    setUploading(true);
    setUploadError(null);
    try {
      const { urls, errors } = await mediaApi.uploadImages(Array.from(files));
      if (urls.length > 0) onChange([...images, ...urls]);
      // Partial success is normal — one oversized file should not discard the
      // others, so what failed is named rather than swallowed.
      if (errors.length > 0) setUploadError(errors.join(' · '));
    } catch (err) {
      setUploadError(errorMessage(err, 'Could not upload that image'));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>
        Variant images (optional)
        <input
          type="file" accept="image/*" multiple
          disabled={disabled || uploading}
          onChange={(e) => { void handleFiles(e.target.files); e.target.value = ''; }}
          style={{ display: 'block', marginTop: 4, fontSize: 12 }}
        />
      </label>

      {uploading && <span style={{ fontSize: 12, color: '#64748b' }}>Uploading…</span>}
      {uploadError && (
        <span role="alert" style={{ fontSize: 12, color: '#991b1b' }}>{uploadError}</span>
      )}

      {images.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {images.map((url) => (
            <span key={url} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, border: '1px solid #cbd5e1', borderRadius: 4, padding: '2px 6px', fontSize: 11 }}>
              <img src={url} alt="" style={{ width: 24, height: 24, objectFit: 'cover', borderRadius: 2 }} />
              <button
                type="button" disabled={disabled}
                onClick={() => onChange(images.filter((u) => u !== url))}
                aria-label="Remove variant image"
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: '#991b1b' }}
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

interface VariantManagerProps {
  productId: string;
  /** Seeds the price field, so a one-SKU product does not make the seller retype it. */
  basePrice?: number;
}

/**
 * One option on a variant — a NAMED pair, not a fixed column.
 *
 * The form used to offer exactly two boxes, "Colour" and "Size", and collapsed
 * them into `{ color, size }`. CreateVariantSchema takes
 * `attributes: z.record(z.string())` — any keys at all — so storage capacity
 * a seller could not reach: no Material, no Storage, no Length. A phone listing
 * had to call its capacities "sizes".
 */
interface DraftOption {
  name:  string;
  value: string;
}

interface DraftVariant {
  sku:            string;
  options:        DraftOption[];
  price:          string;
  compareAtPrice: string;
  stock:          string;
  images:         string[];
}

const EMPTY_DRAFT: DraftVariant = {
  sku: '',
  // Two blank rows to start: enough to express "Black / Small" without the
  // seller first hunting for an "add option" button.
  options: [{ name: '', value: '' }, { name: '', value: '' }],
  price: '',
  compareAtPrice: '',
  stock: '',
  images: [],
};

/**
 * Collapse the option rows into the attribute map the server stores.
 *
 * A row needs BOTH halves to count: a name with no value describes nothing, and
 * a value with no name cannot be filtered on. Names are lower-cased so
 * "Colour", "colour" and "COLOUR" land on one key rather than three.
 */
function toAttributes(draft: DraftVariant): Record<string, string> {
  const attributes: Record<string, string> = {};
  for (const option of draft.options) {
    const name  = option.name.trim().toLowerCase();
    const value = option.value.trim();
    if (name && value) attributes[name] = value;
  }
  return attributes;
}

/**
 * Render an attribute map as a human label.
 *
 * Keys are included now that they are arbitrary: "Red · M" is readable when the
 * options can only be colour and size, but "128GB · Black · Cotton" leaves the
 * seller guessing which is which once they are not.
 */
function describe(attributes: Record<string, string>): string {
  const pairs = Object.entries(attributes ?? {}).filter(([, value]) => value);
  if (pairs.length === 0) return 'Default';
  return pairs.map(([name, value]) => `${name}: ${value}`).join(' · ');
}

function errorMessage(err: any, fallback: string): string {
  return err?.response?.data?.message ?? err?.message ?? fallback;
}

export const VariantCreationUI: React.FC<VariantManagerProps> = ({ productId, basePrice }) => {
  const [variants, setVariants] = useState<Variant[]>([]);
  const [draft, setDraft] = useState<DraftVariant>(EMPTY_DRAFT);
  const [isLoading, setIsLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The variant being re-stocked inline, and the value typed into it.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editStock, setEditStock] = useState('');

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      setVariants(await variantsApi.list(productId));
      setError(null);
    } catch (err) {
      setError(errorMessage(err, 'Could not load variants'));
    } finally {
      setIsLoading(false);
    }
  }, [productId]);

  useEffect(() => { void load(); }, [load]);

  const handleAdd = async () => {
    const price = Number(draft.price);
    const stock = Number(draft.stock);

    // Mirrors CreateVariantSchema: price must be positive, stock a non-negative
    // integer. Checked here so a typo is a message rather than a 422.
    if (!Number.isFinite(price) || price <= 0) {
      setError('Enter a price greater than zero.');
      return;
    }
    if (!Number.isFinite(stock) || stock < 0 || !Number.isInteger(stock)) {
      setError('Stock must be a whole number, zero or more.');
      return;
    }

    setBusy(true);
    try {
      const compareAt = draft.compareAtPrice.trim() ? Number(draft.compareAtPrice) : undefined;

      const created = await variantsApi.create(productId, {
        // Omitted rather than empty — the server generates one from the slug.
        sku:        draft.sku.trim() || undefined,
        attributes: toAttributes(draft),
        price,
        // Only sent when the seller typed one: the schema takes a positive
        // number or nothing, and an empty string would 422 the whole variant.
        ...(compareAt !== undefined ? { compareAtPrice: compareAt } : {}),
        stock,
        images: draft.images,
      });
      setVariants((prev) => [...prev, created]);
      setDraft(EMPTY_DRAFT);
      setError(null);
    } catch (err) {
      setError(errorMessage(err, 'Could not add variant'));
    } finally {
      setBusy(false);
    }
  };

  const handleSaveStock = async (variant: Variant) => {
    const stock = Number(editStock);
    if (!Number.isFinite(stock) || stock < 0) return;

    setBusy(true);
    try {
      const updated = await variantsApi.update(productId, variant.id, { stock });
      setVariants((prev) => prev.map((v) => (v.id === updated.id ? updated : v)));
      setEditingId(null);
      setError(null);
    } catch (err) {
      setError(errorMessage(err, 'Could not update stock'));
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (variant: Variant) => {
    // The last variant is what makes the product sellable at all — removing it
    // returns the listing to the unbuyable state this whole flow exists to
    // prevent, so it is refused here rather than explained afterwards.
    if (variants.length === 1) {
      setError('A product needs at least one SKU. Add another before removing this one.');
      return;
    }
    if (!window.confirm(`Remove SKU ${variant.sku}? This cannot be undone.`)) return;

    setBusy(true);
    try {
      await variantsApi.remove(productId, variant.id);
      setVariants((prev) => prev.filter((v) => v.id !== variant.id));
      setError(null);
    } catch (err) {
      setError(errorMessage(err, 'Could not remove variant'));
    } finally {
      setBusy(false);
    }
  };

  const cell = { padding: 8, fontSize: 13 };
  const input = { flex: 1, padding: 6, borderRadius: 4, border: '1px solid #cbd5e1', fontSize: 12 };

  return (
    <div style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: 8, padding: 16, margin: '16px 0' }}>
      <h4 style={{ margin: '0 0 4px 0', fontSize: 15, color: '#0f172a' }}>Variants &amp; stock</h4>
      <p style={{ margin: '0 0 12px 0', fontSize: 12, color: '#64748b' }}>
        Each option combination is its own SKU with its own price and stock.
      </p>

      {error && (
        <div role="alert" style={{ background: '#fee2e2', border: '1px solid #ef4444', color: '#991b1b', borderRadius: 4, padding: '8px 12px', fontSize: 13, marginBottom: 12 }}>
          {error}
        </div>
      )}

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginBottom: 12 }}>
        <thead>
          <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>
            <th style={cell}>SKU</th>
            <th style={cell}>Options</th>
            <th style={cell}>Price (UGX)</th>
            <th style={cell}>Stock</th>
            <th style={cell}>Reserved</th>
            <th style={cell} />
          </tr>
        </thead>
        <tbody>
          {isLoading && (
            <tr><td colSpan={6} style={{ ...cell, textAlign: 'center', color: '#64748b' }}>Loading variants…</td></tr>
          )}

          {!isLoading && variants.length === 0 && (
            <tr><td colSpan={6} style={{ ...cell, textAlign: 'center', color: '#64748b' }}>No variants yet — add the first one below.</td></tr>
          )}

          {!isLoading && variants.map((variant) => (
            <tr key={variant.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
              <td style={{ ...cell, fontWeight: 700 }}><code>{variant.sku}</code></td>
              <td style={cell}>{describe(variant.attributes)}</td>
              <td style={{ ...cell, color: '#0284c7', fontWeight: 700 }}>{variant.price.toLocaleString()}</td>
              <td style={{ ...cell, fontWeight: 700 }}>
                {editingId === variant.id ? (
                  <input
                    type="number"
                    min={0}
                    value={editStock}
                    autoFocus
                    disabled={busy}
                    onChange={(e) => setEditStock(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void handleSaveStock(variant);
                      if (e.key === 'Escape') setEditingId(null);
                    }}
                    aria-label={`New stock for ${variant.sku}`}
                    style={{ width: 70, padding: 4, borderRadius: 4, border: '1px solid #cbd5e1' }}
                  />
                ) : variant.stock}
              </td>
              {/* Held by carts mid-checkout — shown so "5 in stock but cannot sell 5" is self-explanatory. */}
              <td style={{ ...cell, color: '#64748b' }}>{variant.reserved}</td>
              <td style={{ ...cell, textAlign: 'right', whiteSpace: 'nowrap' }}>
                {editingId === variant.id ? (
                  <>
                    <button type="button" onClick={() => void handleSaveStock(variant)} disabled={busy}
                      style={{ background: '#10b981', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer', marginRight: 6 }}>
                      Save
                    </button>
                    <button type="button" onClick={() => setEditingId(null)} disabled={busy}
                      style={{ background: 'none', border: '1px solid #cbd5e1', borderRadius: 4, padding: '4px 10px', fontSize: 12, cursor: 'pointer' }}>
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <button type="button"
                      onClick={() => { setEditingId(variant.id); setEditStock(String(variant.stock)); }}
                      style={{ background: 'none', border: '1px solid #3b82f6', color: '#3b82f6', borderRadius: 4, padding: '4px 10px', fontSize: 12, cursor: 'pointer', marginRight: 6 }}>
                      Edit stock
                    </button>
                    <button type="button" onClick={() => void handleDelete(variant)} disabled={busy}
                      style={{ background: 'none', border: '1px solid #ef4444', color: '#ef4444', borderRadius: 4, padding: '4px 10px', fontSize: 12, cursor: 'pointer' }}>
                      Remove
                    </button>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* ── Add row ────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {/* Options are named pairs, so a phone lists Storage and a shirt lists
            Size without either having to borrow the other's vocabulary. */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {draft.options.map((option, index) => (
            <div key={index} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                placeholder="Option (e.g. Colour)" value={option.name} disabled={busy}
                onChange={(e) => setDraft({
                  ...draft,
                  options: draft.options.map((o, i) => (i === index ? { ...o, name: e.target.value } : o)),
                })}
                style={input} aria-label={`Option ${index + 1} name`}
              />
              <input
                placeholder="Value (e.g. Black)" value={option.value} disabled={busy}
                onChange={(e) => setDraft({
                  ...draft,
                  options: draft.options.map((o, i) => (i === index ? { ...o, value: e.target.value } : o)),
                })}
                style={input} aria-label={`Option ${index + 1} value`}
              />
              <button
                type="button" disabled={busy || draft.options.length === 1}
                onClick={() => setDraft({ ...draft, options: draft.options.filter((_, i) => i !== index) })}
                aria-label={`Remove option ${index + 1}`}
                style={{ background: 'none', border: '1px solid #cbd5e1', borderRadius: 4, padding: '6px 10px', fontSize: 12, cursor: busy ? 'default' : 'pointer' }}
              >
                ✕
              </button>
            </div>
          ))}
          <button
            type="button" disabled={busy}
            onClick={() => setDraft({ ...draft, options: [...draft.options, { name: '', value: '' }] })}
            style={{ alignSelf: 'flex-start', background: 'none', border: 'none', color: '#0284c7', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0 }}
          >
            + Add another option
          </button>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input placeholder="SKU (optional)" value={draft.sku} disabled={busy}
            onChange={(e) => setDraft({ ...draft, sku: e.target.value })} style={input} aria-label="SKU" />
          <input type="number" placeholder={basePrice ? String(basePrice) : 'Price'} value={draft.price} disabled={busy}
            onChange={(e) => setDraft({ ...draft, price: e.target.value })} style={input} aria-label="Price" />
          <input type="number" placeholder="Was price (optional)" value={draft.compareAtPrice} disabled={busy}
            onChange={(e) => setDraft({ ...draft, compareAtPrice: e.target.value })} style={input} aria-label="Compare-at price" />
          <input type="number" placeholder="Stock" value={draft.stock} disabled={busy}
            onChange={(e) => setDraft({ ...draft, stock: e.target.value })} style={input} aria-label="Stock" />
          <button type="button" onClick={() => void handleAdd()} disabled={busy}
            style={{ backgroundColor: '#0284c7', color: '#fff', border: 'none', borderRadius: 4, padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: busy ? 'default' : 'pointer' }}>
            {busy ? 'Working…' : '+ Add Variant'}
          </button>
        </div>

        {/* Real uploads through media-service, the same path the product
            gallery uses — never a data: URI, which the server rejects. */}
        <VariantImagePicker
          images={draft.images}
          disabled={busy}
          onChange={(images) => setDraft({ ...draft, images })}
        />
      </div>
    </div>
  );
};
