/** Money is rounded to 2dp at every boundary so cents cannot drift. */
export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** One seller's slice of a coupon, against the basket it was priced on. */
export interface SellerDiscountSlice {
  sellerId: string;
  /** That seller's goods value the coupon is allowed to touch. */
  eligibleAmount: number;
  /** What the coupon is worth against those goods. */
  discountAmount: number;
}

/**
 * Split `total` across sellers in proportion to their eligible value.
 *
 * Largest-remainder, so the parts sum to `total` exactly rather than to
 * `total ± a cent per seller`. Sellers are visited in id order and ties on the
 * remainder are broken the same way, so the same basket always produces the
 * same split — two services computing it independently cannot disagree.
 *
 * A seller with nothing eligible gets exactly 0 and is never handed a
 * remainder cent, which is what keeps "seller B funded none of seller A's
 * promotion" true down to the last cent.
 */
export function allocateProportionally(
  total: number,
  eligibleBySeller: Map<string, number>,
): Map<string, number> {
  const sellers = [...eligibleBySeller.keys()].sort((a, b) => a.localeCompare(b));
  const out = new Map<string, number>(sellers.map((s) => [s, 0]));

  const pool = sellers.reduce((sum, s) => sum + (eligibleBySeller.get(s) ?? 0), 0);
  if (total <= 0 || pool <= 0) return out;

  // Work in cents: integer arithmetic makes "sums exactly" a fact rather than
  // a hope about floating point.
  const totalCents = Math.round(total * 100);

  const exact = sellers.map((sellerId) => {
    const eligible = eligibleBySeller.get(sellerId) ?? 0;
    const share = (totalCents * eligible) / pool;
    return { sellerId, eligible, floor: Math.floor(share), remainder: share - Math.floor(share) };
  });

  let assigned = exact.reduce((sum, e) => sum + e.floor, 0);
  let leftover = totalCents - assigned;

  // Hand the spare cents to the largest remainders first. Only sellers with
  // something eligible can receive one.
  const byRemainder = [...exact]
    .filter((e) => e.eligible > 0)
    .sort((a, b) => b.remainder - a.remainder || a.sellerId.localeCompare(b.sellerId));

  for (let i = 0; leftover > 0 && i < byRemainder.length; i += 1, leftover -= 1) {
    byRemainder[i].floor += 1;
  }

  for (const e of exact) {
    // Never more than the seller's own eligible goods: a coupon cannot make a
    // seller's line worth less than nothing.
    out.set(e.sellerId, Math.min(round2(e.floor / 100), round2(e.eligible)));
  }

  return out;
}
