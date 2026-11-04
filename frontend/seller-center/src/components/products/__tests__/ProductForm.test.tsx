// @vitest-environment jsdom
//
// seller-center's other suites are API-payload tests and run in node. This one
// renders a component, so it asks for a DOM per-file rather than switching the
// whole package over.
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// ─── Adding a product ─────────────────────────────────────────────────────────
//
// What a seller can actually get out of this form, and what it refuses to send.
//
// Three behaviours are pinned here because each was a real gap:
//
//   • DRAFT was reachable through the whole stack — products.api.ts carries
//     `status`, CreateProductSchema accepts DRAFT or PENDING_APPROVAL — but the
//     form only ever submitted, so a seller had no way to park a half-written
//     listing anywhere except the moderation queue.
//   • The save button never disabled itself, because `isLoading` came from a
//     slice that only set `status: 'loading'` for the LIST fetch. Pressing Save
//     twice on a slow connection filed the listing twice.
//   • Photos could be added and never removed: the only control was a
//     comma-separated text field, so correcting a mistaken upload meant editing
//     a URL string by hand.

const getCategories = vi.fn();
vi.mock('../../../api/products.api', () => ({
  productsApi: { getCategories: (...a: unknown[]) => getCategories(...a) },
}));

const uploadImages = vi.fn();
vi.mock('../../../api/media.api', () => ({
  mediaApi: { uploadImages: (...a: unknown[]) => uploadImages(...a) },
}));

const { ProductForm } = await import('../ProductForm');

/** The minimum a listing needs to be accepted. */
async function fillRequired(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/product name/i), 'Kasese Pure Honey 1L');
  await user.type(screen.getByLabelText(/^price/i), '35000');
}

beforeEach(() => {
  getCategories.mockResolvedValue([{ id: 'cat-1', name: 'Food' }]);
  uploadImages.mockResolvedValue({ urls: [], errors: [] });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('submitting versus saving a draft', () => {
  it('submits for review with PENDING_APPROVAL — publishing is moderation’s outcome', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<ProductForm onSubmit={onSubmit} isLoading={false} />);

    await fillRequired(user);
    await user.click(screen.getByRole('button', { name: /submit for review/i }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      name:   'Kasese Pure Honey 1L',
      price:  '35000',
      status: 'PENDING_APPROVAL',
    });
  });

  it('saves a draft with DRAFT, so a half-written listing need not enter the queue', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<ProductForm onSubmit={onSubmit} isLoading={false} />);

    await fillRequired(user);
    await user.click(screen.getByRole('button', { name: /save as draft/i }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0].status).toBe('DRAFT');
  });

  it('validates a draft too — a bad price is a 422 whichever button was pressed', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<ProductForm onSubmit={onSubmit} isLoading={false} />);

    await user.type(screen.getByLabelText(/product name/i), 'Kasese Pure Honey 1L');
    await user.type(screen.getByLabelText(/^price/i), '-5');
    await user.click(screen.getByRole('button', { name: /save as draft/i }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(await screen.findByText(/price must be greater than zero/i)).toBeTruthy();
  });
});

describe('the form refuses what the server would refuse', () => {
  it('does not submit a name shorter than the schema’s minimum', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<ProductForm onSubmit={onSubmit} isLoading={false} />);

    await user.type(screen.getByLabelText(/product name/i), 'A');
    await user.type(screen.getByLabelText(/^price/i), '35000');
    await user.click(screen.getByRole('button', { name: /submit for review/i }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(await screen.findByText(/at least 2 characters/i)).toBeTruthy();
  });

  it('rejects a data: URI, which ImageUrlSchema refuses outright', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<ProductForm onSubmit={onSubmit} isLoading={false} />);

    await fillRequired(user);
    await user.type(screen.getByLabelText(/paste image urls/i), 'data:image/png;base64,AAAA');
    await user.click(screen.getByRole('button', { name: /submit for review/i }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(await screen.findByText(/inline image data is not accepted/i)).toBeTruthy();
  });

  it('summarises how many fields need attention rather than failing silently', async () => {
    const user = userEvent.setup();
    render(<ProductForm onSubmit={vi.fn()} isLoading={false} />);

    // Nothing filled in: name and price are both required.
    await user.click(screen.getByRole('button', { name: /submit for review/i }));

    expect(await screen.findByText(/2 fields need attention/i)).toBeTruthy();
  });

  it('clears a field’s error as soon as it is corrected', async () => {
    const user = userEvent.setup();
    render(<ProductForm onSubmit={vi.fn()} isLoading={false} />);

    await user.click(screen.getByRole('button', { name: /submit for review/i }));
    expect(await screen.findByText(/name must be at least/i)).toBeTruthy();

    await user.type(screen.getByLabelText(/product name/i), 'Kasese Honey');

    await waitFor(() =>
      expect(screen.queryByText(/name must be at least/i)).toBeNull(),
    );
  });
});

describe('while a save is in flight', () => {
  it('disables both actions, so one product is not filed twice', async () => {
    render(<ProductForm onSubmit={vi.fn()} isLoading />);

    expect(screen.getByRole('button', { name: /saving/i }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: /save as draft/i }).hasAttribute('disabled')).toBe(true);
  });

  it('says what is happening rather than a generic spinner label', async () => {
    render(<ProductForm onSubmit={vi.fn()} isLoading />);
    expect(screen.getByRole('button', { name: /saving/i })).toBeTruthy();
  });
});

describe('photos', () => {
  it('stores the URL media-service returned, never the file itself', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    uploadImages.mockResolvedValue({ urls: ['https://cdn.muni.ug/a.webp'], errors: [] });

    render(<ProductForm onSubmit={onSubmit} isLoading={false} />);
    await fillRequired(user);

    const file = new File(['x'], 'honey.png', { type: 'image/png' });
    await user.upload(screen.getByLabelText(/upload images/i), file);

    await waitFor(() => expect(uploadImages).toHaveBeenCalled());
    await user.click(screen.getByRole('button', { name: /submit for review/i }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0].imageUrls).toBe('https://cdn.muni.ug/a.webp');
  });

  it('lets a seller remove a photo they did not mean to add', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    uploadImages.mockResolvedValue({
      urls: ['https://cdn.muni.ug/a.webp', 'https://cdn.muni.ug/b.webp'],
      errors: [],
    });

    render(<ProductForm onSubmit={onSubmit} isLoading={false} />);
    await fillRequired(user);

    await user.upload(
      screen.getByLabelText(/upload images/i),
      new File(['x'], 'a.png', { type: 'image/png' }),
    );

    await waitFor(() => expect(screen.getAllByRole('img')).toHaveLength(2));

    await user.click(screen.getByRole('button', { name: /remove photo 1/i }));
    await user.click(screen.getByRole('button', { name: /submit for review/i }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    // Only the second survives, and it is now the main photo.
    expect(onSubmit.mock.calls[0][0].imageUrls).toBe('https://cdn.muni.ug/b.webp');
  });

  it('reports photos that failed to upload instead of dropping them quietly', async () => {
    const user = userEvent.setup();
    uploadImages.mockResolvedValue({ urls: [], errors: ['big.png is 24.0 MB — the limit is 20 MB.'] });

    render(<ProductForm onSubmit={vi.fn()} isLoading={false} />);
    await user.upload(
      screen.getByLabelText(/upload images/i),
      new File(['x'], 'big.png', { type: 'image/png' }),
    );

    expect(await screen.findByText(/the limit is 20 MB/i)).toBeTruthy();
  });
});

describe('categories come from product-service, not a hardcoded list', () => {
  it('offers what the API returned', async () => {
    render(<ProductForm onSubmit={vi.fn()} isLoading={false} />);

    await waitFor(() => expect(getCategories).toHaveBeenCalled());
    expect(await screen.findByRole('option', { name: 'Food' })).toBeTruthy();
  });

  it('stays usable, and says why, when the category list cannot be loaded', async () => {
    getCategories.mockRejectedValue(new Error('network'));
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(<ProductForm onSubmit={onSubmit} isLoading={false} />);
    expect(await screen.findByText(/categories could not be loaded/i)).toBeTruthy();

    // categoryId is optional on CreateProductSchema, so this must still save.
    await fillRequired(user);
    await user.click(screen.getByRole('button', { name: /submit for review/i }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
  });
});
