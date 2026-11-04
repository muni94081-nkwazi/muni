# MUNI Mobile App

> Africa's marketplace in your pocket — built with Expo / React Native

## 🚀 Quick Start

```bash
cd mobile
npm install
npx expo start
```

- Press **`a`** for Android emulator
- Press **`i`** for iOS simulator  
- Scan QR code with **Expo Go** app on your phone

---

## 🏗️ Architecture

```
mobile/
├── app/                         # Expo Router (file-based routing)
│   ├── _layout.tsx              # Root layout (fonts, Redux, Paper theme)
│   ├── (auth)/                  # Auth screens (no tab bar)
│   │   ├── login.tsx
│   │   ├── register.tsx
│   │   └── forgot-password.tsx
│   ├── (tabs)/                  # Main app with bottom tab bar
│   │   ├── index.tsx            # Home
│   │   ├── search.tsx           # Search
│   │   ├── cart.tsx             # Cart
│   │   ├── orders.tsx           # Orders
│   │   └── profile.tsx          # Profile + Settings
│   ├── product/[id].tsx         # Product detail
│   ├── checkout/                # 3-step checkout flow
│   └── seller/                  # Seller dashboard (role-gated)
│
├── src/
│   ├── api/                     # Axios API client + typed API calls
│   ├── components/              # Shared UI components
│   ├── constants/               # Theme, categories, currencies
│   ├── hooks/                   # Custom React hooks
│   ├── i18n/                    # i18next setup + 7 language files
│   ├── notifications/           # Push notification setup + handlers
│   ├── store/                   # Redux Toolkit slices + store
│   └── types/                   # TypeScript type definitions
│
├── assets/
│   ├── fonts/                   # Inter font family
│   └── images/                  # App icon, splash screen
│
├── app.json                     # Expo config
├── eas.json                     # EAS Build profiles
└── metro.config.js              # Metro bundler config
```

---

## 🌍 Supported Languages

| Language | Code | Countries           | RTL |
|----------|------|---------------------|-----|
| English  | `en` | Uganda, Kenya, etc. | No  |
| Swahili  | `sw` | Kenya, Tanzania, UG | No  |
| French   | `fr` | West Africa         | No  |
| Arabic   | `ar` | North Africa, ME    | **Yes** |
| Yoruba   | `yo` | Nigeria             | No  |
| Hausa    | `ha` | Nigeria, Niger      | No  |
| Amharic  | `am` | Ethiopia            | No  |

Change language: **Profile → Language**

---

## 💰 Supported Currencies

UGX, USD, KES, TZS, NGN, GHS, ZAR, EUR, GBP, EGP, ETB, XOF

Change currency: **Profile → Currency**

---

## 📱 Screens

### Customer Flow
1. **Login / Register** — JWT auth with token refresh
2. **Home** — Featured products, flash sales, categories, new arrivals
3. **Search** — Debounced search with filters (price, category, rating, sort)
4. **Product Detail** — Images, variants, quantity, add to cart / buy now
5. **Cart** — Quantity management, coupon codes, order summary
6. **Checkout** — 3 steps: Shipping → Payment → Confirmation
7. **Orders** — Active, completed, cancelled with status tracking
8. **Profile** — Settings, language, currency, sign out

### Seller Flow (requires `ROLE_SELLER`)
- Dashboard, product management, order management, analytics, payouts

---

## 🔔 Push Notifications

Handled via Expo Notifications:
- **Order updates** — confirmed, shipped, delivered
- **Price alerts** — wishlisted item price drops
- **Flash sales** — promotional notifications

Deep links:
- `muni://orders/:id` — opens specific order
- `muni://product/:id` — opens product page

---

## 🏗️ State Management

Redux Toolkit slices:
| Slice      | Description                    |
|------------|-------------------------------|
| `auth`     | JWT tokens, user profile      |
| `cart`     | Cart items, summary, coupon   |
| `products` | Product lists, search results |
| `ui`       | Language, currency, theme     |

---

## 🔐 Security

- JWT tokens stored in **Expo SecureStore** (encrypted, not AsyncStorage)
- Automatic token refresh on 401 responses
- No sensitive data in AsyncStorage or in-memory Redux (only in SecureStore)

---

## 📦 Build & Deploy

### Development Build
```bash
npx eas build --profile development --platform android
```

### Preview (Internal Testing)
```bash
npm run build:preview
```

### Production
```bash
npm run build:production
# Then submit:
npm run submit:android
npm run submit:ios
```

### OTA Updates (without app store submission)
```bash
npx eas update --branch production --message "Fix cart total calculation"
```

---

## 🧪 Testing
```bash
npm test                  # Run all tests
npm test -- --coverage    # With coverage report
```

---

## 🌐 Environment Variables

Copy `.env.example` → `.env` and fill in:

| Variable | Description |
|---|---|
| `EXPO_PUBLIC_API_URL` | Backend API URL (http://localhost:8080 for dev) |
| `EXPO_PUBLIC_ENV` | `development`, `staging`, or `production` |
| `EXPO_PUBLIC_SENTRY_DSN` | Sentry error tracking DSN |

---

## 📋 Prerequisites

- Node.js 20+
- Expo CLI: `npm install -g expo-cli`
- EAS CLI: `npm install -g eas-cli`
- iOS: Xcode 15+ (Mac only)
- Android: Android Studio + emulator
