import React, { useEffect, useMemo, useState } from 'react';
import { Button } from '../common/Button/Button';
import { productsApi } from '../../api/products.api';
import { mediaApi } from '../../api/media.api';

interface CategoryOption {
  id:   string;
  name: string;
}

/**
 * Client-side validation, mirroring what product-service will apply.
 *
 * Deliberately a mirror, not a replacement: `toPayload` sends this to
 * CreateProductSchema, which validates again. The point of checking here is
 * that a seller who mistypes a price finds out at the field rather than through
 * a 422 whose `issues` array the page does not render.
 *
 * Kept in step with backend/services/product-service/src/services/
 * product.service.ts — the rules below are its rules, not new ones:
 *
 *   name       min 2, max 255
 *   basePrice  positive
 *   images     http(s) only; ImageUrlSchema rejects data:, javascript:, file:
 *   stock      non-negative integer
 */
const NAME_MIN = 2;
const NAME_MAX = 255;

export interface ProductFormValues {
  name:            string;
  description:     string;
  price:           string;
  compareAtPrice:  string;
  sku:             string;
  stock:           string;
  category:        string;
  brand:           string;
  tags:            string;
  imageUrls:       string;
}

/**
 * What leaves the form on submit.
 *
 * `status` is the seller's choice between keeping the listing private and
 * putting it in the moderation queue — the only two values CreateProductSchema
 * accepts. It was already carried end to end (products.api.ts defaults it to
 * PENDING_APPROVAL, product-service refuses ACTIVE outright); the form simply
 * never offered the draft half of it.
 */
export type ProductSubmitValues = ProductFormValues & { status: 'DRAFT' | 'PENDING_APPROVAL' };

interface ProductFormProps {
  initialValues?: Partial<ProductFormValues>;
  onSubmit: (values: ProductSubmitValues) => void;
  isLoading: boolean;
}

type FieldErrors = Partial<Record<keyof ProductFormValues, string>>;

export function validateProductForm(values: ProductFormValues): FieldErrors {
  const errors: FieldErrors = {};

  const name = values.name.trim();
  if (name.length < NAME_MIN)      errors.name = `Name must be at least ${NAME_MIN} characters.`;
  else if (name.length > NAME_MAX) errors.name = `Name must be ${NAME_MAX} characters or fewer.`;

  const price = Number(values.price);
  if (!values.price.trim())        errors.price = 'Price is required.';
  else if (!Number.isFinite(price) || price <= 0) errors.price = 'Price must be greater than zero.';

  if (values.compareAtPrice.trim()) {
    const compareAt = Number(values.compareAtPrice);
    if (!Number.isFinite(compareAt) || compareAt <= 0) {
      errors.compareAtPrice = 'Compare-at price must be greater than zero.';
    } else if (Number.isFinite(price) && compareAt <= price) {
      // Not a server rule, but a "was 10,000, now 12,000" listing is a pricing
      // mistake the seller wants to hear about before it reaches a shopper.
      errors.compareAtPrice = 'Compare-at price should be higher than the price.';
    }
  }

  if (values.stock.trim()) {
    const stock = Number(values.stock);
    if (!Number.isInteger(stock) || stock < 0) {
      errors.stock = 'Stock must be a whole number, zero or more.';
    }
  }

  // Mirrors ImageUrlSchema. The old file picker inlined base64 `data:` URIs
  // here, which the server now rejects outright.
  const badImage = values.imageUrls
    .split(',')
    .map((url) => url.trim())
    .filter(Boolean)
    .find((url) => !/^https?:\/\//i.test(url));

  if (badImage) {
    errors.imageUrls = badImage.startsWith('data:')
      ? 'Inline image data is not accepted — use the upload button instead.'
      : `"${badImage.slice(0, 40)}" is not an http(s) URL.`;
  }

  return errors;
}

// ─── Presentation ─────────────────────────────────────────────────────────────
//
// Styles come from the tokens in styles/variables.css, which is what makes this
// form follow the rest of seller-center — including dark mode, where the old
// hardcoded #fff card and #ccc borders rendered light-on-light. Layout is
// `repeat(auto-fit, minmax(...))` rather than fixed columns, so the same markup
// is a single column on a phone and two on a desktop without a media query.

const card: React.CSSProperties = {
  background:   'var(--color-surface)',
  border:       '1px solid var(--color-border)',
  borderRadius: 'var(--radius-md)',
  boxShadow:    'var(--shadow-sm)',
  padding:      'var(--spacing-6)',
  marginBottom: 'var(--spacing-4)',
};

const legend: React.CSSProperties = {
  fontSize:     '0.95rem',
  fontWeight:   600,
  color:        'var(--color-text-primary)',
  marginBottom: 'var(--spacing-1)',
};

const sectionHint: React.CSSProperties = {
  fontSize:     '0.8125rem',
  color:        'var(--color-text-secondary)',
  margin:       '0 0 var(--spacing-4)',
};

const grid = (min = 220): React.CSSProperties => ({
  display:             'grid',
  gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))`,
  gap:                 'var(--spacing-4)',
});

const control = (invalid?: boolean): React.CSSProperties => ({
  width:        '100%',
  boxSizing:    'border-box',
  padding:      '0.625rem 0.75rem',
  fontSize:     '0.875rem',
  fontFamily:   'inherit',
  color:        'var(--color-text-primary)',
  background:   'var(--color-surface)',
  border:       `1px solid ${invalid ? 'var(--color-danger)' : 'var(--color-border)'}`,
  borderRadius: 'var(--radius-md)',
  outline:      'none',
});

/** Label, optional hint, control and one error line — the same shape every time. */
const Field: React.FC<{
  label:     string;
  htmlFor:   string;
  required?: boolean;
  hint?:     string;
  error?:    string;
  children:  React.ReactNode;
}> = ({ label, htmlFor, required, hint, error, children }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-1)' }}>
    <label
      htmlFor={htmlFor}
      style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'var(--color-text-primary)' }}
    >
      {label}
      {required && <span style={{ color: 'var(--color-danger)' }}> *</span>}
    </label>
    {children}
    {error ? (
      <span role="alert" style={{ fontSize: '0.75rem', color: 'var(--color-danger)' }}>
        {error}
      </span>
    ) : hint ? (
      <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>{hint}</span>
    ) : null}
  </div>
);

export const ProductForm: React.FC<ProductFormProps> = ({ initialValues, onSubmit, isLoading }) => {
  // The category select previously offered three hardcoded display names
  // ('Electronics', 'Fashion', 'Home'). product-service expects a categoryId,
  // so every one of those would have been persisted as a dangling reference.
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [categoriesFailed, setCategoriesFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    productsApi
      .getCategories()
      .then((rows: CategoryOption[]) => {
        if (!cancelled) setCategories(Array.isArray(rows) ? rows : []);
      })
      .catch(() => {
        // A category list that fails to load must not block the form — category
        // is optional on CreateProductSchema — but the seller should know why
        // the select is empty rather than assume the platform has no categories.
        if (!cancelled) { setCategories([]); setCategoriesFailed(true); }
      });
    return () => { cancelled = true; };
  }, []);

  // `weight` was in here and had a field on the form. There is no weight column
  // on Product — the schema has `weightKg` on ProductVariant, and toPayload
  // never sent it — so whatever the seller typed was discarded on submit.
  const [values, setValues] = useState<ProductFormValues>({
    name: '', description: '', price: '', compareAtPrice: '', sku: '',
    stock: '', category: '', brand: '', tags: '', imageUrls: '',
    ...initialValues,
  });

  const [errors, setErrors] = useState<FieldErrors>({});

  // Image upload state. Separate from `isLoading` (which is the product save)
  // so the file input can disable itself without disabling the whole form.
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  /** The image list, derived from the single comma-separated field it is stored in. */
  const images = useMemo(
    () => values.imageUrls.split(',').map((url) => url.trim()).filter(Boolean),
    [values.imageUrls],
  );

  const setImages = (next: string[]) =>
    setValues((prev) => ({ ...prev, imageUrls: next.join(', ') }));

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setValues((prev) => ({ ...prev, [name]: value }));
    // Clear the field's error as soon as it is touched. Leaving it until the
    // next submit means a corrected field keeps showing the old complaint.
    setErrors((prev) => (prev[name as keyof ProductFormValues] ? { ...prev, [name]: undefined } : prev));
  };

  /**
   * Both buttons land here; `status` is what separates them.
   *
   * Validation runs for a draft too. A draft with a negative price is still a
   * 422 from the server, and finding that out at the field is better than
   * finding it out from a toast.
   */
  const submitWith = (status: ProductSubmitValues['status']) => (e: React.FormEvent) => {
    e.preventDefault();

    const found = validateProductForm(values);
    setErrors(found);
    // Stops here rather than letting the server 422 — the page renders the
    // message, not the `issues` array, so a rejected save would otherwise say
    // only "Could not create the product".
    if (Object.keys(found).length > 0) return;

    onSubmit({ ...values, status });
  };

  const busy = isLoading || isUploading;
  const errorCount = Object.values(errors).filter(Boolean).length;

  return (
    <form onSubmit={submitWith('PENDING_APPROVAL')} noValidate>
      {errorCount > 0 && (
        <div
          role="alert"
          style={{
            ...card,
            marginBottom:   'var(--spacing-4)',
            borderColor:    'var(--color-danger)',
            background:     'color-mix(in srgb, var(--color-danger) 8%, var(--color-surface))',
            color:          'var(--color-danger)',
            padding:        'var(--spacing-4)',
            fontSize:       '0.875rem',
          }}
        >
          {errorCount === 1
            ? 'One field needs attention before this can be saved.'
            : `${errorCount} fields need attention before this can be saved.`}
        </div>
      )}

      {/* ── Basics ─────────────────────────────────────────────────────────── */}
      <section style={card}>
        <h2 style={legend}>Product details</h2>
        <p style={sectionHint}>What the shopper sees first.</p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-4)' }}>
          <Field label="Product name" htmlFor="name" required error={errors.name}
                 hint={`${values.name.trim().length}/${NAME_MAX} characters`}>
            <input
              id="name" name="name" value={values.name} onChange={handleChange}
              placeholder="e.g. Kasese Pure Honey 1L"
              maxLength={NAME_MAX} aria-invalid={!!errors.name}
              style={control(!!errors.name)}
            />
          </Field>

          <Field label="Description" htmlFor="description"
                 hint="Materials, dimensions, what is in the box — anything a shopper would otherwise message you to ask.">
            <textarea
              id="description" name="description" value={values.description} onChange={handleChange}
              rows={5}
              style={{ ...control(), minHeight: 120, resize: 'vertical' }}
            />
          </Field>
        </div>
      </section>

      {/* ── Price and stock ────────────────────────────────────────────────── */}
      <section style={card}>
        <h2 style={legend}>Price and stock</h2>
        <p style={sectionHint}>
          Stock is held against this listing's first SKU. Add colours or sizes after saving,
          from the product's edit page.
        </p>

        {/* 260px rather than the default: these four pair up naturally (price
            with its compare-at, SKU with its stock), and a narrower minimum
            let a third column in and left the fourth field stranded alone on
            the next row. */}
        <div style={grid(260)}>
          <Field label="Price (UGX)" htmlFor="price" required error={errors.price}>
            <input
              id="price" name="price" type="number" min={0} inputMode="numeric"
              value={values.price} onChange={handleChange} placeholder="35000"
              aria-invalid={!!errors.price} style={control(!!errors.price)}
            />
          </Field>

          <Field label="Compare-at price (UGX)" htmlFor="compareAtPrice" error={errors.compareAtPrice}
                 hint="Shown struck through. Leave blank if this is not on offer.">
            <input
              id="compareAtPrice" name="compareAtPrice" type="number" min={0} inputMode="numeric"
              value={values.compareAtPrice} onChange={handleChange} placeholder="40000"
              aria-invalid={!!errors.compareAtPrice} style={control(!!errors.compareAtPrice)}
            />
          </Field>

          {/* SKU is not required: product-service generates one from the product
              slug when it is omitted, so demanding it was asking the seller for
              something the server can work out. */}
          <Field label="SKU" htmlFor="sku" hint="Leave blank and we will generate one.">
            <input
              id="sku" name="sku" value={values.sku} onChange={handleChange}
              placeholder="HNY-001" style={control()}
            />
          </Field>

          <Field label="Stock quantity" htmlFor="stock" error={errors.stock}
                 hint="A listing with no stock cannot be bought, even once approved.">
            <input
              id="stock" name="stock" type="number" min={0} inputMode="numeric"
              value={values.stock} onChange={handleChange} placeholder="0"
              aria-invalid={!!errors.stock} style={control(!!errors.stock)}
            />
          </Field>
        </div>
      </section>

      {/* ── Organisation ───────────────────────────────────────────────────── */}
      <section style={card}>
        <h2 style={legend}>Organisation</h2>
        <p style={sectionHint}>How shoppers find this product when they are not searching for it by name.</p>

        <div style={grid()}>
          <Field
            label="Category" htmlFor="category"
            hint={categoriesFailed ? 'Categories could not be loaded — you can save without one and set it later.' : undefined}
          >
            <select
              id="category" name="category" value={values.category} onChange={handleChange}
              style={control()}
            >
              <option value="">Select a category</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </Field>

          <Field label="Brand" htmlFor="brand">
            <input
              id="brand" name="brand" value={values.brand} onChange={handleChange}
              placeholder="e.g. Samsung" style={control()}
            />
          </Field>
        </div>

        <div style={{ marginTop: 'var(--spacing-4)' }}>
          <Field label="Tags" htmlFor="tags" hint="Comma separated.">
            <input
              id="tags" name="tags" value={values.tags} onChange={handleChange}
              placeholder="phone, electronics, android" style={control()}
            />
          </Field>
        </div>
      </section>

      {/* ── Images ─────────────────────────────────────────────────────────── */}
      <section style={card}>
        <h2 style={legend}>Photos</h2>
        <p style={sectionHint}>
          Uploaded straight to MUNI's media service. The first photo is the one shoppers see in search results.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-4)' }}>
          {/* Uploads to media-service and stores the returned URL. This used
              FileReader.readAsDataURL and pushed the resulting base64 `data:`
              URI into `imageUrls`, so nothing was ever uploaded — and
              product-service now rejects `data:` URIs outright. */}
          <Field label="Upload images" htmlFor="imageFiles"
                 hint="JPEG, PNG, WebP, AVIF or GIF · up to 20 MB each">
            <input
              id="imageFiles"
              type="file"
              accept="image/jpeg,image/png,image/webp,image/avif,image/gif"
              multiple
              disabled={isUploading || isLoading}
              onChange={async (e) => {
                const picked = Array.from(e.target.files ?? []);
                if (picked.length === 0) return;

                // Cleared immediately so picking the same file twice re-fires
                // change, and so a failed batch can simply be re-picked.
                e.target.value = '';

                setUploadError(null);
                setIsUploading(true);
                setUploadProgress({ done: 0, total: picked.length });

                try {
                  const { urls, errors: failures } = await mediaApi.uploadImages(picked, (done, total) =>
                    setUploadProgress({ done, total }),
                  );

                  if (urls.length > 0) {
                    setImages([...images, ...urls]);
                    setErrors((prev) => ({ ...prev, imageUrls: undefined }));
                  }
                  // Partial success is reported rather than swallowed: the
                  // seller needs to know which photos did not make it.
                  if (failures.length > 0) setUploadError(failures.join(' · '));
                } catch (err) {
                  setUploadError(
                    err instanceof Error ? err.message : 'Upload failed. Please try again.',
                  );
                } finally {
                  setIsUploading(false);
                  setUploadProgress(null);
                }
              }}
              style={{ ...control(), padding: '0.5rem', background: 'var(--color-surface-muted)' }}
            />
          </Field>

          {isUploading && uploadProgress && (
            <p role="status" style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>
              Uploading {uploadProgress.done} of {uploadProgress.total}…
            </p>
          )}

          {uploadError && (
            <p role="alert" style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--color-danger)' }}>
              {uploadError}
            </p>
          )}

          {images.length > 0 && (
            <div style={grid(120)}>
              {images.map((url, index) => (
                <figure
                  key={`${url}-${index}`}
                  style={{
                    margin: 0, position: 'relative', aspectRatio: '1 / 1',
                    border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)',
                    overflow: 'hidden', background: 'var(--color-surface-muted)',
                  }}
                >
                  <img
                    src={url} alt={`Product photo ${index + 1}`}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                  />
                  {index === 0 && (
                    <figcaption
                      style={{
                        position: 'absolute', left: 0, bottom: 0, right: 0,
                        background: 'rgba(15,23,42,0.72)', color: '#fff',
                        fontSize: '0.6875rem', padding: '2px 6px', textAlign: 'center',
                      }}
                    >
                      Main photo
                    </figcaption>
                  )}
                  <button
                    type="button"
                    aria-label={`Remove photo ${index + 1}`}
                    onClick={() => setImages(images.filter((_, i) => i !== index))}
                    style={{
                      position: 'absolute', top: 4, right: 4, width: 24, height: 24,
                      display: 'grid', placeItems: 'center', cursor: 'pointer',
                      border: 'none', borderRadius: '50%',
                      background: 'rgba(15,23,42,0.72)', color: '#fff', fontSize: 14, lineHeight: 1,
                    }}
                  >
                    ×
                  </button>
                </figure>
              ))}
            </div>
          )}

          <Field
            label="Or paste image URLs" htmlFor="imageUrls" error={errors.imageUrls}
            hint="Comma separated. Must start with http:// or https://."
          >
            <input
              id="imageUrls" name="imageUrls" value={values.imageUrls} onChange={handleChange}
              placeholder="https://example.com/image.jpg"
              aria-invalid={!!errors.imageUrls} style={control(!!errors.imageUrls)}
            />
          </Field>
        </div>
      </section>

      {/* ── Actions ────────────────────────────────────────────────────────── */}
      <div
        style={{
          ...card,
          display: 'flex', flexWrap: 'wrap', gap: 'var(--spacing-3)',
          alignItems: 'center', justifyContent: 'flex-end',
        }}
      >
        <p style={{ margin: 0, marginRight: 'auto', fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>
          Submitting sends this listing to an admin for review.
        </p>

        <Button
          type="button"
          variant="secondary"
          disabled={busy}
          onClick={submitWith('DRAFT')}
        >
          Save as draft
        </Button>

        {/* The label carries the state rather than Button's `isLoading`, whose
            generic "Loading..." replaces the children and tells the seller less
            than the verb for what is actually happening. */}
        <Button type="submit" variant="primary" disabled={busy}>
          {isLoading ? 'Saving…' : 'Submit for review'}
        </Button>
      </div>
    </form>
  );
};
