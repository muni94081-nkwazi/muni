// @vitest-environment jsdom
//
// seller-center's other suites are API-payload tests and run in node. This one
// renders a component, so it asks for a DOM per-file rather than switching the
// whole package over.
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// ─── Variant creation ─────────────────────────────────────────────────────────
//
// The form offered exactly two option boxes, "Colour" and "Size", and collapsed
// them into `{ color, size }`. CreateVariantSchema takes
// `attributes: z.record(z.string())` — any keys at all — so a phone listing had
// to file its capacities under "size", and Material, Storage or Length were
// simply unreachable. It also never sent `images` or `compareAtPrice`, both of
// which the schema already accepts.
//
// These drive the real component against a mocked API client, so they check the
// payload that actually reaches product-service.

const list = vi.fn();
const create = vi.fn();
const update = vi.fn();
const remove = vi.fn();
vi.mock('../../../api/variants.api', () => ({
  variantsApi: {
    list:   (...a: unknown[]) => list(...a),
    create: (...a: unknown[]) => create(...a),
    update: (...a: unknown[]) => update(...a),
    remove: (...a: unknown[]) => remove(...a),
  },
}));

const uploadImages = vi.fn();
vi.mock('../../../api/media.api', () => ({
  mediaApi: { uploadImages: (...a: unknown[]) => uploadImages(...a) },
}));

const { VariantCreationUI } = await import('../VariantCreationUI');

const existing = {
  id: 'v-1',
  productId: 'prod-1',
  sku: 'TS-BLK-S',
  attributes: { color: 'Black', size: 'S' },
  price: 30000,
  compareAtPrice: null,
  stock: 10,
  reserved: 0,
  availableStock: 10,
  lowStockThreshold: 5,
  images: [],
  active: true,
};

/** Fill one option row — the rows are rendered in order. */
async function setOption(index: number, name: string, value: string) {
  await userEvent.type(screen.getByLabelText(`Option ${index} name`), name);
  await userEvent.type(screen.getByLabelText(`Option ${index} value`), value);
}

// This package has no global test setup, so nothing unmounts the previous
// render — without it each test sees the DOM of every test before it.
afterEach(cleanup);

beforeEach(() => {
  list.mockReset().mockResolvedValue([existing]);
  create.mockReset().mockResolvedValue({ ...existing, id: 'v-2', sku: 'NEW' });
  update.mockReset();
  remove.mockReset();
  uploadImages.mockReset().mockResolvedValue({ urls: [], errors: [] });
});

describe('variant attributes are free-form, as the server stores them', () => {
  it('sends whatever option names the seller typed', async () => {
    render(<VariantCreationUI productId="prod-1" />);
    await screen.findByText(/TS-BLK-S/);

    await setOption(1, 'Storage', '256GB');
    await setOption(2, 'Colour', 'Blue');
    await userEvent.type(screen.getByLabelText('Price'), '2400000');
    await userEvent.type(screen.getByLabelText('Stock'), '4');
    await userEvent.click(screen.getByRole('button', { name: /Add Variant/i }));

    await waitFor(() => expect(create).toHaveBeenCalled());
    // Not { color, size } — the two keys the form used to be limited to.
    expect(create.mock.calls[0][1]).toMatchObject({
      attributes: { storage: '256GB', colour: 'Blue' },
    });
  });

  it('lets the seller add a third option beyond the two default rows', async () => {
    render(<VariantCreationUI productId="prod-1" />);
    await screen.findByText(/TS-BLK-S/);

    await userEvent.click(screen.getByRole('button', { name: /Add another option/i }));
    await setOption(1, 'Colour', 'Black');
    await setOption(2, 'Size', 'M');
    await setOption(3, 'Material', 'Cotton');
    await userEvent.type(screen.getByLabelText('Price'), '32000');
    await userEvent.type(screen.getByLabelText('Stock'), '8');
    await userEvent.click(screen.getByRole('button', { name: /Add Variant/i }));

    await waitFor(() => expect(create).toHaveBeenCalled());
    expect(create.mock.calls[0][1].attributes).toEqual({
      colour: 'Black', size: 'M', material: 'Cotton',
    });
  });

  it('lower-cases option names so one option is not stored under three keys', async () => {
    render(<VariantCreationUI productId="prod-1" />);
    await screen.findByText(/TS-BLK-S/);

    await setOption(1, 'COLOUR', 'Red');
    await userEvent.type(screen.getByLabelText('Price'), '1000');
    await userEvent.type(screen.getByLabelText('Stock'), '1');
    await userEvent.click(screen.getByRole('button', { name: /Add Variant/i }));

    await waitFor(() => expect(create).toHaveBeenCalled());
    expect(create.mock.calls[0][1].attributes).toEqual({ colour: 'Red' });
  });

  it('drops a half-filled option row rather than storing an empty value', async () => {
    render(<VariantCreationUI productId="prod-1" />);
    await screen.findByText(/TS-BLK-S/);

    await setOption(1, 'Colour', 'Green');
    await userEvent.type(screen.getByLabelText('Option 2 name'), 'Size'); // no value
    await userEvent.type(screen.getByLabelText('Price'), '1000');
    await userEvent.type(screen.getByLabelText('Stock'), '1');
    await userEvent.click(screen.getByRole('button', { name: /Add Variant/i }));

    await waitFor(() => expect(create).toHaveBeenCalled());
    expect(create.mock.calls[0][1].attributes).toEqual({ colour: 'Green' });
  });
});

describe('the fields the contract accepts but the form never sent', () => {
  it('sends compareAtPrice only when one was typed', async () => {
    render(<VariantCreationUI productId="prod-1" />);
    await screen.findByText(/TS-BLK-S/);

    await setOption(1, 'Colour', 'Black');
    await userEvent.type(screen.getByLabelText('Price'), '30000');
    await userEvent.type(screen.getByLabelText('Stock'), '5');
    await userEvent.click(screen.getByRole('button', { name: /Add Variant/i }));

    await waitFor(() => expect(create).toHaveBeenCalled());
    // Absent, not an empty string: the schema takes a positive number or
    // nothing, and '' would 422 the whole variant.
    expect(create.mock.calls[0][1]).not.toHaveProperty('compareAtPrice');
  });

  it('sends compareAtPrice as a number when it is filled in', async () => {
    render(<VariantCreationUI productId="prod-1" />);
    await screen.findByText(/TS-BLK-S/);

    await setOption(1, 'Colour', 'Black');
    await userEvent.type(screen.getByLabelText('Price'), '30000');
    await userEvent.type(screen.getByLabelText('Compare-at price'), '40000');
    await userEvent.type(screen.getByLabelText('Stock'), '5');
    await userEvent.click(screen.getByRole('button', { name: /Add Variant/i }));

    await waitFor(() => expect(create).toHaveBeenCalled());
    expect(create.mock.calls[0][1].compareAtPrice).toBe(40000);
  });

  it('stores the media-service URL an upload returned, never a data: URI', async () => {
    uploadImages.mockResolvedValue({
      urls: ['http://localhost:8080/api/v1/media/uploads/abc.webp'],
      errors: [],
    });

    render(<VariantCreationUI productId="prod-1" />);
    await screen.findByText(/TS-BLK-S/);

    const file = new File(['x'], 'variant.png', { type: 'image/png' });
    await userEvent.upload(screen.getByLabelText(/Variant images/i), file);
    await waitFor(() => expect(uploadImages).toHaveBeenCalled());

    await setOption(1, 'Colour', 'Black');
    await userEvent.type(screen.getByLabelText('Price'), '30000');
    await userEvent.type(screen.getByLabelText('Stock'), '5');
    await userEvent.click(screen.getByRole('button', { name: /Add Variant/i }));

    await waitFor(() => expect(create).toHaveBeenCalled());
    expect(create.mock.calls[0][1].images).toEqual([
      'http://localhost:8080/api/v1/media/uploads/abc.webp',
    ]);
  });
});

describe('the variant list names each option', () => {
  it('labels an existing variant with its keys, not just its values', async () => {
    render(<VariantCreationUI productId="prod-1" />);

    // "color: Black · size: S" rather than the ambiguous "Black · S".
    expect(await screen.findByText(/color: Black/)).toBeTruthy();
    expect(screen.getByText(/size: S/)).toBeTruthy();
  });
});
