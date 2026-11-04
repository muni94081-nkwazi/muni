// Mock data generator for the storefront customizer (banners, carousel, custom URL slug).
import type { CarouselItem, StorefrontBanner, StorefrontConfig } from '@/types/storefront.types';
import { pickMany, randomId, randomInt } from './mockUtils';

const BANNER_POOL: { headline: string; imageUrl: string; linkUrl: string }[] = [
  {
    headline: 'Back to School Mega Sale — Up to 40% Off',
    imageUrl: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=1200&q=80',
    linkUrl: '/promotions/back-to-school',
  },
  {
    headline: 'New Arrivals: Latest Electronics & Gadgets',
    imageUrl: 'https://images.unsplash.com/photo-1550009158-9ebf69173e03?w=1200&q=80',
    linkUrl: '/collections/new-arrivals',
  },
  {
    headline: 'Free Delivery on Orders Over UGX 100,000',
    imageUrl: 'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?w=1200&q=80',
    linkUrl: '/promotions/free-delivery',
  },
  {
    headline: 'Shop Local: Ugandan Made Products',
    imageUrl: 'https://images.unsplash.com/photo-1610632380989-680fe40816c6?w=1200&q=80',
    linkUrl: '/collections/made-in-uganda',
  },
];

const CAROUSEL_PRODUCT_POOL: { productId: string; productName: string; imageUrl: string }[] = [
  { productId: 'prod_001', productName: 'Kasese Pure Honey 1L', imageUrl: 'https://images.unsplash.com/photo-1587049352846-4a222e784d38?w=600&q=80' },
  { productId: 'prod_002', productName: 'Ugandan Coffee Beans 500g', imageUrl: 'https://images.unsplash.com/photo-1447933601403-0c6688de566e?w=600&q=80' },
  { productId: 'prod_003', productName: "Men's Polo Shirt", imageUrl: 'https://images.unsplash.com/photo-1585487000160-6ebcfceb0d03?w=600&q=80' },
  { productId: 'prod_004', productName: 'Shea Butter Body Cream', imageUrl: 'https://images.unsplash.com/photo-1556228720-195a672e8a03?w=600&q=80' },
  { productId: 'prod_005', productName: 'Non-stick Frying Pan', imageUrl: 'https://images.unsplash.com/photo-1584990347449-a5d9f800a783?w=600&q=80' },
  { productId: 'prod_006', productName: 'Samsung Galaxy S24 Ultra', imageUrl: 'https://images.unsplash.com/photo-1610945415295-d9bbf067e59c?w=600&q=80' },
  { productId: 'prod_007', productName: 'Wireless Bluetooth Earbuds', imageUrl: 'https://images.unsplash.com/photo-1590658268037-6bf12165a8df?w=600&q=80' },
  { productId: 'prod_008', productName: "Women's Ankara Dress", imageUrl: 'https://images.unsplash.com/photo-1594633312681-425c7b97ccd1?w=600&q=80' },
];

export function generateStorefrontConfig(): StorefrontConfig {
  const bannerCount = randomInt(3, 4);
  const banners: StorefrontBanner[] = BANNER_POOL.slice(0, bannerCount).map((b, i) => ({
    id: randomId('banner'),
    ...b,
    order: i,
  }));

  const carouselCount = randomInt(4, 6);
  const carousel: CarouselItem[] = pickMany(CAROUSEL_PRODUCT_POOL, carouselCount).map((p, i) => ({
    id: randomId('carousel'),
    ...p,
    order: i,
  }));

  return {
    storeName: 'Kampala Tech Official Store',
    customUrlSlug: 'kampala-tech',
    banners,
    carousel,
    themeColor: '#2563eb',
  };
}
