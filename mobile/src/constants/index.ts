export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8080';

export const SECURE_STORE_KEYS = {
  ACCESS_TOKEN:  'muni_access_token',
  REFRESH_TOKEN: 'muni_refresh_token',
} as const;

export const STORAGE_KEYS = {
  LANGUAGE:        'muni_language',
  CURRENCY:        'muni_currency',
  THEME:           'muni_theme',
  LOW_DATA_MODE:   'muni_low_data_mode',
  RECENT_SEARCHES: 'muni_recent_searches',
  ONBOARDING_DONE: 'muni_onboarding_done',
} as const;

export const PRODUCT_CATEGORIES = [
  { id: 'electronics',  name: 'Electronics',  icon: 'laptop',             color: '#3498DB' },
  { id: 'fashion',      name: 'Fashion',       icon: 'tshirt-crew',        color: '#E91E63' },
  { id: 'food',         name: 'Food',          icon: 'food',               color: '#FF9800' },
  { id: 'books',        name: 'Books',         icon: 'book-open-variant',  color: '#9C27B0' },
  { id: 'home',         name: 'Home & Garden', icon: 'home-variant',       color: '#4CAF50' },
  { id: 'beauty',       name: 'Beauty',        icon: 'face-woman',         color: '#F06292' },
  { id: 'sports',       name: 'Sports',        icon: 'basketball',         color: '#FF5722' },
  { id: 'health',       name: 'Health',        icon: 'medical-bag',        color: '#00BCD4' },
  { id: 'toys',         name: 'Toys & Kids',   icon: 'toy-brick',          color: '#FFEB3B' },
] as const;

// ── Currencies ────────────────────────────────────────────────────────────────

export const SUPPORTED_CURRENCIES = [
  { code: 'UGX', name: 'Ugandan Shilling',   symbol: 'USh',  flag: '🇺🇬' },
  { code: 'USD', name: 'US Dollar',           symbol: '$',    flag: '🇺🇸' },
  { code: 'KES', name: 'Kenyan Shilling',     symbol: 'KSh',  flag: '🇰🇪' },
  { code: 'TZS', name: 'Tanzanian Shilling',  symbol: 'TSh',  flag: '🇹🇿' },
  { code: 'NGN', name: 'Nigerian Naira',      symbol: '₦',    flag: '🇳🇬' },
  { code: 'GHS', name: 'Ghanaian Cedi',       symbol: 'GH₵',  flag: '🇬🇭' },
  { code: 'ZAR', name: 'South African Rand',  symbol: 'R',    flag: '🇿🇦' },
  { code: 'EUR', name: 'Euro',                symbol: '€',    flag: '🇪🇺' },
  { code: 'GBP', name: 'British Pound',       symbol: '£',    flag: '🇬🇧' },
  { code: 'EGP', name: 'Egyptian Pound',      symbol: 'E£',   flag: '🇪🇬' },
  { code: 'ETB', name: 'Ethiopian Birr',      symbol: 'Br',   flag: '🇪🇹' },
  { code: 'XOF', name: 'West African CFA',    symbol: 'CFA',  flag: '🌍' },
] as const;

// ── Delivery ──────────────────────────────────────────────────────────────────

export const DELIVERY_METHODS = [
  {
    id:          'standard',
    name:        'Standard Delivery',
    days:        '3-5 business days',
    price:       5_000,   // UGX
    icon:        'truck-delivery',
  },
  {
    id:          'express',
    name:        'Express Delivery',
    days:        '1-2 business days',
    price:       15_000,
    icon:        'lightning-bolt',
  },
  {
    id:          'same_day',
    name:        'Same Day Delivery',
    days:        'Order before 12pm',
    price:       25_000,
    icon:        'rocket-launch',
  },
] as const;

// ── Payment Methods ───────────────────────────────────────────────────────────

export const MOBILE_MONEY_PROVIDERS = [
  { id: 'mtn_momo', name: 'MTN Mobile Money', logo: '🟡', countryCode: '+256' },
  { id: 'airtel',   name: 'Airtel Money',      logo: '🔴', countryCode: '+256' },
  { id: 'mpesa',    name: 'M-Pesa',            logo: '🟢', countryCode: '+254' },
] as const;

// ── Pagination ────────────────────────────────────────────────────────────────

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_RECENT_SEARCHES = 10;

// ── Image ─────────────────────────────────────────────────────────────────────

export const PLACEHOLDER_IMAGE = 'https://via.placeholder.com/300x300?text=MUNI';
export const CDN_BASE_URL      = 'https://cdn.muni.ug';

// ── App ───────────────────────────────────────────────────────────────────────

export const APP_NAME    = 'MUNI';
export const APP_TAGLINE = 'Shop African, Ship Anywhere';
export const SUPPORT_EMAIL = 'support@muni.ug';
export const SUPPORT_WHATSAPP = '+256731808027';
