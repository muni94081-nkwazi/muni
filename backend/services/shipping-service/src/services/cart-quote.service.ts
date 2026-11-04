import { Hub, Region, isHub, regionForCity } from '../models/region.js';
import type { ServiceLevel, TariffQuote } from '../models/tariff.model.js';
import { regionTariffService, TariffCalculationError } from './tariff.service.js';

// ─── Quoting a basket, rather than a parcel ───────────────────────────────────
//
// `regionTariffService.quote` prices ONE parcel and needs an origin hub, a
// destination region and a weight. A checkout has none of those: it has an
// address and a list of cart lines.
//
// Nothing bridged the two. checkout-service called
// `POST /api/v1/shipping/quote` — a path this service has never exposed — got a
// 404, swallowed it as "shipping quote unavailable", and charged 0. Every order
// placed through checkout shipped free while the rate card above sat unused.
//
// This is that bridge, and it lives here because the two things it has to
// decide — which region an address is in, and what a parcel of unknown weight
// costs — are shipping's to decide, not checkout's.

/**
 * Where MUNI ships from. Configurable because the hub a marketplace dispatches
 * from is an operational fact, not a constant.
 */
const ORIGIN_HUB: Hub = (() => {
  const configured = process.env.SHIPPING_ORIGIN_HUB;
  return configured && isHub(configured) ? configured : 'KAMPALA_HUB';
})();

/**
 * What one unit of an unweighed item is assumed to weigh.
 *
 * `weightKg` is nullable on the catalogue and most sellers leave it empty, but
 * the rate card cannot price a parcel of unknown weight — and `quote()` rejects
 * a weight of 0 outright. So a stated assumption is unavoidable here.
 *
 * It is deliberately NOT hidden: every quote reports `estimatedLines`, the
 * number of lines this fallback was applied to, so a fee resting on an
 * assumption is distinguishable downstream from one resting on real data.
 */
const DEFAULT_ITEM_WEIGHT_KG = Number(process.env.SHIPPING_DEFAULT_ITEM_WEIGHT_KG ?? 0.5);

export interface CartQuoteLine {
  sellerId?: string;
  quantity:  number;
  weightKg?: number | null;
  lengthCm?: number | null;
  widthCm?:  number | null;
  heightCm?: number | null;
}

export interface CartQuoteAddress {
  city?:     string;
  district?: string;
}

export interface CartQuoteRequest {
  shippingAddress: CartQuoteAddress;
  items:           CartQuoteLine[];
  serviceLevel?:   ServiceLevel;
  codAmount?:      number;
}

export interface SellerParcelQuote {
  sellerId:       string;
  weightKg:       number;
  estimatedLines: number;
  fee:            number;
  estimatedDays:  number;
}

export interface CartQuote {
  /** What the basket costs to ship, in total. */
  cost:              number;
  currency:          string;
  destinationRegion: Region;
  originHub:         Hub;
  serviceLevel:      ServiceLevel;
  /** The longest ETA across the parcels — the basket is complete when the last one lands. */
  estimatedDays:     number;
  /** sellerId → fee. Sums exactly to `cost`. */
  perSeller:         Record<string, number>;
  parcels:           SellerParcelQuote[];
  /** How many lines were priced on the assumed weight rather than a real one. */
  estimatedLines:    number;
}

/** The seller a line is attributed to when the caller names none. */
const UNATTRIBUTED_SELLER = 'muni-store';

function positive(value: unknown): number | undefined {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/**
 * Price a basket.
 *
 * One parcel per seller, not one per basket: sellers dispatch independently, so
 * a two-vendor order is two consignments and carries two base fees. Quoting the
 * whole basket as a single parcel would under-charge by a base fee for every
 * seller after the first.
 */
export function quoteCart(request: CartQuoteRequest): CartQuote {
  const { shippingAddress, items, serviceLevel, codAmount } = request;

  if (!Array.isArray(items) || items.length === 0) {
    throw new TariffCalculationError('A shipping quote needs at least one item');
  }

  // `district` is the fallback because a rural address commonly names only the
  // district; anything unrecognised falls to UPCOUNTRY, which is the honest
  // answer for an address this service cannot place.
  const city = (shippingAddress?.city ?? '').trim() || (shippingAddress?.district ?? '').trim();
  if (!city) {
    throw new TariffCalculationError('A shipping quote needs a delivery city or district');
  }
  const destinationRegion = regionForCity(city);

  // Group into per-seller parcels.
  const bySeller = new Map<string, CartQuoteLine[]>();
  for (const line of items) {
    const quantity = Number(line?.quantity);
    if (!Number.isInteger(quantity) || quantity < 1) {
      throw new TariffCalculationError('Every line needs a whole quantity of at least 1');
    }
    const sellerId = (line.sellerId ?? '').trim() || UNATTRIBUTED_SELLER;
    const bucket = bySeller.get(sellerId) ?? [];
    bucket.push({ ...line, quantity });
    bySeller.set(sellerId, bucket);
  }

  // COD handling is charged on the order, not per consignment, so it is applied
  // to exactly one parcel rather than once per seller.
  const cod = positive(codAmount);
  let codApplied = false;

  const parcels: SellerParcelQuote[] = [];
  let estimatedLines = 0;

  for (const [sellerId, lines] of bySeller) {
    let weightKg = 0;
    let estimatedHere = 0;

    // Dimensions are summed only where every line in the parcel declares them;
    // a partial set would understate volumetric weight, so it is discarded
    // rather than guessed at.
    let volume = 0;
    let allDimensioned = true;

    for (const line of lines) {
      const declared = positive(line.weightKg);
      if (declared === undefined) estimatedHere += 1;
      weightKg += (declared ?? DEFAULT_ITEM_WEIGHT_KG) * line.quantity;

      const l = positive(line.lengthCm);
      const w = positive(line.widthCm);
      const h = positive(line.heightCm);
      if (l && w && h) volume += l * w * h * line.quantity;
      else allDimensioned = false;
    }

    estimatedLines += estimatedHere;
    weightKg = Math.round(weightKg * 1000) / 1000;

    // The engine takes one L×W×H, so the parcel's summed volume is handed over
    // as a cube of the same volume — the dimensional weight it derives depends
    // only on the product, so the shape chosen does not change the fee.
    const side = allDimensioned && volume > 0 ? Math.cbrt(volume) : undefined;

    const quote: TariffQuote = regionTariffService.quote({
      originHub: ORIGIN_HUB,
      destinationRegion,
      weightKg,
      ...(side ? { lengthCm: side, widthCm: side, heightCm: side } : {}),
      serviceLevel,
      ...(cod !== undefined && !codApplied ? { codAmount: cod } : {}),
    });
    if (cod !== undefined) codApplied = true;

    parcels.push({
      sellerId,
      weightKg,
      estimatedLines: estimatedHere,
      fee:            quote.totalFee,
      estimatedDays:  quote.estimatedDays,
    });
  }

  const perSeller: Record<string, number> = {};
  for (const parcel of parcels) perSeller[parcel.sellerId] = parcel.fee;

  return {
    cost:              parcels.reduce((sum, p) => sum + p.fee, 0),
    currency:          'UGX',
    destinationRegion,
    originHub:         ORIGIN_HUB,
    serviceLevel:      serviceLevel ?? 'standard',
    estimatedDays:     Math.max(...parcels.map((p) => p.estimatedDays)),
    perSeller,
    parcels,
    estimatedLines,
  };
}
