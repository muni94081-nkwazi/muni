import { createMockProduct } from '@/types/product.types';
import type { Category, Product } from '@/types/product.types';
import type { PaginatedResponse } from '@/types/api.types';

/**
 * Opt-in mock responses for developing the UI without the backend running.
 * Disabled unless VITE_USE_MOCK_API=true (see .env.example) — wired in from
 * axios.config.ts's network-error branch, only when the backend on :8080 is
 * genuinely unreachable. Not exhaustive: covers the endpoints the home page
 * needs today. Add a case here when you hit a "no mock for <path>" warning
 * for a route you need while working offline.
 */

function paginated(data: Product[]): PaginatedResponse<Product> {
  return { data, meta: { current_page: 0, last_page: 1, per_page: data.length, total: data.length } };
}

const MOCK_CATEGORIES: Category[] = [
  { id: 'cat_phones', name: 'Phones', slug: 'phones', level: 0, isActive: true, order: 0 },
  { id: 'cat_fashion', name: 'Fashion', slug: 'fashion', level: 0, isActive: true, order: 1 },
  { id: 'cat_home', name: 'Home & Kitchen', slug: 'home-kitchen', level: 0, isActive: true, order: 2 },
  { id: 'cat_beauty', name: 'Beauty', slug: 'beauty', level: 0, isActive: true, order: 3 },
];

const MOCK_PRODUCTS: Product[] = MOCK_CATEGORIES.map((category, i) =>
  createMockProduct({
    id: `mock_${i}`,
    name: `${category.name} sample item`,
    slug: `mock-${category.slug}-item`,
    currency: 'UGX',
    price: 25000 + i * 10000,
    category,
  }),
);

/** Returns mock data for a known API path, or `undefined` if there's no mock for it. */
export function getMockResponse(path: string): unknown | undefined {
  if (path === '/categories') return MOCK_CATEGORIES;
  if (path.startsWith('/products/trending')) return paginated(MOCK_PRODUCTS);
  if (path === '/products') return paginated(MOCK_PRODUCTS);
  if (path === '/cart') return { items: [], subtotal: 0, total: 0 };
  if (path === '/containers') return { success: true, data: [] };
  return undefined;
}
