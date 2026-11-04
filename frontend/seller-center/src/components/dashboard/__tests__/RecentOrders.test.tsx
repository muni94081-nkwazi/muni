// @vitest-environment jsdom
//
// Not a comment: this package configures no test environment, so vitest runs
// every file in node and a component render has no `document`. Its sibling
// DOM suite, VariantCreationUI.test.tsx, carries the same first line for the
// same reason. Removing it fails all six tests with "document is not defined".
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';

const list = vi.fn();
vi.mock('../../../api/orders.api', () => ({
  ordersApi: {
    list:   (...a: unknown[]) => list(...a),
    getById: vi.fn(),
    updateStatus: vi.fn(),
  },
}));

const { RecentOrders } = await import('../RecentOrders');

const subOrder = (over: Record<string, unknown> = {}) => ({
  id: 'sub-1',
  subOrderNumber: 'MUNI-9-A',
  masterOrderId: 'ord-9',
  sellerId: 'seller-1',
  status: 'processing',
  statusLabel: 'Preparing Items',
  items: [{ id: 'oi-1', productId: 'p-1', sellerId: 'seller-1', productName: 'Widget', productSku: 'W-1', productImageUrl: null, unitPrice: 40000, quantity: 2, lineTotal: 80000 }],
  subtotal: 80000,
  shippingFee: 4000,
  taxAmount: 14400,
  discountAmount: 0,
  totalAmount: 98400,
  vendorShare: 70000,
  platformCommission: 10000,
  placedAt: '2026-09-11T06:00:00.000Z',
  shippedAt: null,
  deliveredAt: null,
  cancelledAt: null,
  updatedAt: '2026-09-11T06:00:00.000Z',
  ...over,
});

afterEach(cleanup);
beforeEach(() => {
  list.mockReset().mockResolvedValue({ data: [subOrder()], meta: { total: 1, page: 1, perPage: 5 } });
});

describe('recent orders come from the seller orders API', () => {
  it('asks for the seller\'s own orders, newest first', async () => {
    render(<RecentOrders />);
    await waitFor(() => expect(list).toHaveBeenCalled());

    // No vendor id is passed: order-service scopes by the authenticated seller.
    expect(list.mock.calls[0][0]).toBe(1);
    expect(list.mock.calls[0][1]).toBe(5);
  });

  it('renders the real order number and total', async () => {
    render(<RecentOrders />);

    expect(await screen.findByText('MUNI-9-A')).toBeTruthy();
    expect(screen.getByText(/98,400/)).toBeTruthy();
  });

  it('shows none of the invented rows it used to ship with', async () => {
    render(<RecentOrders />);
    await waitFor(() => expect(list).toHaveBeenCalled());

    // The five hardcoded customers, by name.
    for (const name of ['Nakato Mary', 'Ssebunya John', 'Apio Sarah', 'Otieno James', 'Mbabazi Grace']) {
      expect(screen.queryByText(name)).toBeNull();
    }
    expect(screen.queryByText('ORD-001')).toBeNull();
  });

  it('says so when the seller has no orders, rather than inventing some', async () => {
    list.mockResolvedValue({ data: [], meta: { total: 0, page: 1, perPage: 5 } });
    render(<RecentOrders />);

    expect(await screen.findByText(/No orders yet/i)).toBeTruthy();
    expect(screen.queryByText('ORD-001')).toBeNull();
  });

  it('reports a failure instead of falling back to example rows', async () => {
    list.mockRejectedValue(new Error('network'));
    render(<RecentOrders />);

    expect(await screen.findByText(/Could not load/i)).toBeTruthy();
    expect(screen.queryByText('ORD-001')).toBeNull();
  });

  it('labels a status using the label the server sent', async () => {
    list.mockResolvedValue({
      data: [subOrder({ status: 'out_for_delivery', statusLabel: 'Out for Delivery' })],
      meta: { total: 1, page: 1, perPage: 5 },
    });
    render(<RecentOrders />);

    expect(await screen.findByText('Out for Delivery')).toBeTruthy();
  });
});
