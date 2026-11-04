/**
 * The saved address book, owned by user-service.
 *
 * Mirrors its Prisma `Address` model and `createAddressSchema` exactly. Note it
 * is NOT the `Address` in product.types.ts — that one describes a seller's
 * origin/warehouse location and uses `street`/`state`, which user-service does
 * not accept. Nor is it the checkout shipping block, which is a flatter
 * `{ address, city, district, phone, notes }` read by checkout-service's saga.
 * Three related-looking shapes, three different owners.
 */

export type AddressType = 'HOME' | 'WORK' | 'PICKUP_STATION';

export interface SavedAddress {
  id: string;
  userId: string;
  type: AddressType;
  /** Recipient may differ from the account holder (gifts, office deliveries). */
  contactName: string;
  contactPhone: string;
  /** ISO 3166-1 alpha-2, defaulted to UG server-side. */
  country: string;
  region: string;
  district: string;
  ward?: string | null;
  /** Street/plot line, or the station name when type is PICKUP_STATION. */
  addressLine: string;
  landmark?: string | null;
  postalCode?: string | null;
  pickupStationId?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  /** Exactly one per user; user-service enforces it inside a transaction. */
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Body for POST /addresses. `country` is optional here because the server
 * defaults it to 'UG'; everything else in this list is required by the
 * validator and a missing field comes back as a 400.
 */
export interface CreateAddressInput {
  type?: AddressType;
  contactName: string;
  contactPhone: string;
  country?: string;
  region: string;
  district: string;
  ward?: string;
  addressLine: string;
  landmark?: string;
  postalCode?: string;
  pickupStationId?: string;
  isDefault?: boolean;
}

/** PATCH accepts any subset, but rejects an empty object. */
export type UpdateAddressInput = Partial<CreateAddressInput>;
