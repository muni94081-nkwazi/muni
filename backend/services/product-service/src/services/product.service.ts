import { prisma } from '../db/prisma.js';
import { z } from 'zod';
import type { Prisma, ProductStatus } from '../generated/prisma/index.js';
import { searchProducts, indexProduct, deleteProductFromIndex, ensureIndex } from './search.service.js';
import { cached, bumpEntityVersion, entityVersion, CACHE_TTL } from '../../../../shared/cache/protected-cache.js';
import { publish } from '../../../../shared/kafka/producer.js';
import { Topics } from '../../../../shared/kafka/topics.js';

// ── Schemas ───────────────────────────────────────────────────────────────────

/**
 * An image reference the catalogue will store and serve.
 *
 * `z.string().url()` alone is not enough: it delegates to `new URL()`, which
 * happily accepts `data:image/png;base64,…`, `javascript:…` and `file:///…`.
 * The seller form used to inline uploads as base64 `data:` URIs, so a 2 MB
 * photo arrived as ~2.7 MB of string, went into a Postgres text[] column, was
 * copied verbatim into the Elasticsearch document, and was then re-sent to
 * every shopper on every listing that rendered it — bloating the row, the
 * index and every response at once.
 *
 * `javascript:` matters for a different reason: these strings are rendered
 * into `<img src>` and anchor hrefs across three frontends.
 *
 * Restricted to http/https, which is what media-service returns.
 */
export const ImageUrlSchema = z
  .string()
  .url()
  .refine(
    (value) => /^https?:\/\//i.test(value),
    { message: 'Image URLs must be http(s). Upload the file to media-service and store the URL it returns — inline data: URIs are not accepted.' },
  );

/**
 * One SKU, supplied inline when the product is created.
 *
 * Deliberately looser than variant.service's CreateVariantSchema: `attributes`
 * and `price` are optional here because the common case is a seller listing a
 * product with no options at all, who should not have to invent an attribute
 * map or restate the price they just typed. `price` falls back to the
 * product's basePrice and `attributes` to `{}` in createProduct.
 */
const InlineVariantSchema = z.object({
  sku:               z.string().min(1).max(100).optional(),  // generated when omitted
  attributes:        z.record(z.string()).default({}),
  price:             z.number().positive().optional(),       // defaults to basePrice
  compareAtPrice:    z.number().positive().optional(),
  stock:             z.number().int().min(0).default(0),
  lowStockThreshold: z.number().int().min(0).default(5),
  images:            z.array(ImageUrlSchema).default([]),
});

export const CreateProductSchema = z.object({
  name:           z.string().min(2).max(255),
  slug:           z.string().min(2).max(255).regex(/^[a-z0-9-]+$/),
  description:    z.string().optional(),
  categoryId:     z.string().optional(),
  basePrice:      z.number().positive(),
  compareAtPrice: z.number().positive().optional(),
  currency:       z.string().length(3).default('UGX'),
  brand:          z.string().optional(),
  tags:           z.array(z.string()).default([]),
  images:         z.array(ImageUrlSchema).default([]),

  // A seller chooses only between keeping a listing private and submitting it
  // for review. ACTIVE is deliberately not accepted here: it is the outcome of
  // moderation, not an input. Previously this defaulted to ACTIVE, which let
  // any ROLE_SELLER publish straight to the storefront.
  status:         z.enum(['DRAFT', 'PENDING_APPROVAL']).default('PENDING_APPROVAL'),

  /**
   * SKUs to create alongside the product, in the same transaction.
   *
   * Optional, and when omitted createProduct still writes ONE default variant.
   * That is not a convenience — it is what makes the product sellable at all.
   * Stock lives only on ProductVariant; there is no product-level stock column,
   * so formatProduct derives `inStock` from `variants.some(v => v.stock -
   * v.reserved > 0)`. A product with no variants is therefore permanently
   * out of stock no matter what an admin does with it, which is exactly what
   * every product created through seller-center used to be.
   */
  variants:       z.array(InlineVariantSchema).max(100).optional(),
});

/**
 * Statuses a customer-facing surface may ever return.
 *
 * Mutable on purpose — Prisma's `in` filter takes ProductStatus[], and a
 * `readonly` tuple is not assignable to it.
 */
const PUBLIC_STATUSES: ProductStatus[] = ['ACTIVE'];

export const ModerateProductSchema = z
  .object({
    action: z.enum(['approve', 'reject']),
    reason: z.string().min(3).max(1000).optional(),
  })
  .refine((v) => v.action !== 'reject' || (v.reason && v.reason.trim().length > 0), {
    message: 'A rejection reason is required so the seller knows what to fix',
    path:    ['reason'],
  });

export const ModerationQueueSchema = z.object({
  status:   z.enum(['PENDING_APPROVAL', 'ACTIVE', 'REJECTED', 'DRAFT', 'ARCHIVED', 'OUT_OF_STOCK']).default('PENDING_APPROVAL'),
  sellerId: z.string().optional(),
  q:        z.string().optional(),
  page:     z.coerce.number().int().min(0).default(0),
  limit:    z.coerce.number().int().min(1).max(100).default(20),
});

export type ModerateProductInput = z.infer<typeof ModerateProductSchema>;
export type ModerationQueueInput = z.infer<typeof ModerationQueueSchema>;

export const ListProductsSchema = z.object({
  q:          z.string().optional(),
  category:   z.string().optional(),     // slug or id
  minPrice:   z.coerce.number().optional(),
  maxPrice:   z.coerce.number().optional(),
  minRating:  z.coerce.number().min(0).max(5).optional(),
  // NOT z.coerce.boolean(). That is `Boolean(value)`, and every non-empty
  // string is truthy — so `?inStock=false` and `?inStock=0` both parsed to
  // TRUE and filtered the results to in-stock only, the exact opposite of what
  // was asked. Verified against the installed zod:
  //   'true' -> true   'false' -> TRUE   '0' -> TRUE   '' -> false
  //
  // Query strings carry no types, so the string forms have to be read
  // explicitly. Unrecognised input stays falsy, which preserves the previous
  // behaviour for junk: listProducts only adds the stock filter when this is
  // truthy, so false means "no stock filter" rather than "out of stock only".
  inStock: z
    .union([z.boolean(), z.string()])
    .transform((v) => (typeof v === 'boolean' ? v : /^(true|1|yes)$/i.test(v.trim())))
    .optional(),
  sellerId:   z.string().optional(),
  sort:       z.enum(['relevance', 'price_asc', 'price_desc', 'newest', 'rating']).default('relevance'),
  page:       z.coerce.number().int().min(0).default(0),
  limit:      z.coerce.number().int().min(1).max(100).default(20),
});

export type ListProductsInput  = z.infer<typeof ListProductsSchema>;
export type CreateProductInput = z.infer<typeof CreateProductSchema>;

// ── Functions ─────────────────────────────────────────────────────────────────

/**
 * List products with filters.
 *
 * Text search goes to Elasticsearch; browse-without-query stays on Postgres,
 * where the composite indexes cover it.
 *
 * The previous implementation compiled `q` into `ILIKE '%q%'` across name AND
 * description. A leading wildcard cannot use a B-tree, so every keystroke was
 * a sequential scan of the whole catalogue, ORed over two columns and paired
 * with a COUNT(*) over the same predicate. At catalogue scale that holds
 * connections until the pool drains and unrelated queries — including
 * inventory reservation — start queueing behind it.
 */
export async function listProducts(rawQuery: unknown) {
  const params = ListProductsSchema.parse(rawQuery);

  // ── Text search → Elasticsearch ──────────────────────────────────────────
  if (params.q) {
    try {
      return await searchViaElasticsearch(params);
    } catch (err) {
      // ES down is a degraded-search event, not an outage. Fall through to a
      // SQL path that can at least use an index.
      console.warn('[product-service] Elasticsearch unavailable — degraded SQL search:', (err as Error).message);
      return degradedSqlSearch(params);
    }
  }

  const where: Prisma.ProductWhereInput = { status: 'ACTIVE' };

  if (params.category) {
    // Accept both slug and id
    const cat = await prisma.category.findFirst({
      where: { OR: [{ id: params.category }, { slug: params.category }] },
    });
    if (cat) where.categoryId = cat.id;
  }

  if (params.minPrice !== undefined || params.maxPrice !== undefined) {
    // minVariantPrice, not basePrice: the customer is shown the cheapest
    // variant, so that is the figure a price filter has to match. Filtering on
    // basePrice hid a product displayed at 31,000 from maxPrice=35000.
    where.minVariantPrice = {};
    if (params.minPrice !== undefined) where.minVariantPrice.gte = params.minPrice;
    if (params.maxPrice !== undefined) where.minVariantPrice.lte = params.maxPrice;
  }

  if (params.minRating !== undefined) where.averageRating = { gte: params.minRating };
  if (params.sellerId)                where.sellerId = params.sellerId;

  if (params.inStock) {
    where.variants = { some: { active: true, stock: { gt: 0 } } };
  }

  const orderBy: Prisma.ProductOrderByWithRelationInput = (() => {
    switch (params.sort) {
      // Ordered by the price the shopper actually sees on the card.
      case 'price_asc':  return { minVariantPrice: 'asc'  };
      case 'price_desc': return { minVariantPrice: 'desc' };
      case 'newest':     return { createdAt:     'desc' };
      case 'rating':     return { averageRating: 'desc' };
      default:           return { createdAt:     'desc' };
    }
  })();

  const [data, total] = await prisma.$transaction([
    prisma.product.findMany({
      where,
      orderBy,
      skip:    params.page * params.limit,
      take:    params.limit,
      // Same shape formatProduct() consumes — a narrower select here silently
      // drops compareAtPrice/lowStockThreshold and corrupts the list payload.
      include: productInclude,
    }),
    prisma.product.count({ where }),
  ]);

  // Flatten to match legacy API shape
  const products = data.map(formatProduct);

  return {
    data: products,
    meta: {
      current_page: params.page,
      last_page:    Math.max(0, Math.ceil(total / params.limit) - 1),
      per_page:     params.limit,
      total,
    },
  };
}

// ── Search paths ──────────────────────────────────────────────────────────────

/**
 * Elasticsearch owns relevance; Postgres only hydrates the hits.
 *
 * Hydration is a single `WHERE id IN (...)` on the primary key, so it stays
 * O(page size) no matter how large the catalogue grows.
 */
async function searchViaElasticsearch(params: ListProductsInput) {
  const result = await searchProducts({
    q:         params.q,
    category:  params.category,
    minPrice:  params.minPrice,
    maxPrice:  params.maxPrice,
    minRating: params.minRating,
    inStock:   params.inStock,
    sellerId:  params.sellerId,
    sort:      params.sort,
    page:      params.page,
    limit:     params.limit,
  });

  const ids = result.data.map((doc) => doc.id);
  if (ids.length === 0) {
    return { data: [], meta: { ...result.meta, search: 'elasticsearch' }, facets: result.facets };
  }

  const rows = await prisma.product.findMany({
    where:   { id: { in: ids }, status: 'ACTIVE' },
    include: productInclude,
  });

  // Preserve Elasticsearch's ordering — a Postgres IN() returns rows in
  // whatever order it finds them, which would discard the relevance ranking.
  const byId = new Map(rows.map((r) => [r.id, r]));
  const data = ids
    .map((id) => byId.get(id))
    .filter((r): r is NonNullable<typeof r> => r !== undefined)
    .map(formatProduct);

  return {
    data,
    meta:   { ...result.meta, search: 'elasticsearch' },
    facets: result.facets,
  };
}

/**
 * Fallback when Elasticsearch is unreachable.
 *
 * Restricted to `name` and backed by the pg_trgm GIN index created in the
 * composite-index migration, so it is index-assisted rather than a full scan.
 * Deliberately narrower than the ES path — a degraded search that returns in
 * 50ms beats a thorough one that takes the site down.
 */
async function degradedSqlSearch(params: ListProductsInput) {
  const where: Prisma.ProductWhereInput = {
    status: 'ACTIVE',
    name:   { contains: params.q, mode: 'insensitive' },
  };

  if (params.sellerId)                where.sellerId = params.sellerId;
  if (params.minRating !== undefined) where.averageRating = { gte: params.minRating };

  if (params.minPrice !== undefined || params.maxPrice !== undefined) {
    // minVariantPrice, not basePrice: the customer is shown the cheapest
    // variant, so that is the figure a price filter has to match. Filtering on
    // basePrice hid a product displayed at 31,000 from maxPrice=35000.
    where.minVariantPrice = {};
    if (params.minPrice !== undefined) where.minVariantPrice.gte = params.minPrice;
    if (params.maxPrice !== undefined) where.minVariantPrice.lte = params.maxPrice;
  }

  const [data, total] = await prisma.$transaction([
    prisma.product.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip:    params.page * params.limit,
      take:    params.limit,
      include: productInclude,
    }),
    prisma.product.count({ where }),
  ]);

  return {
    data: data.map(formatProduct),
    meta: {
      current_page: params.page,
      last_page:    Math.max(0, Math.ceil(total / params.limit) - 1),
      per_page:     params.limit,
      total,
      search:       'degraded',
    },
  };
}

// ── Cached reads (H4) ─────────────────────────────────────────────────────────
//
// The hottest path in the system previously went to Postgres on every request
// — product-service connected to Redis at startup and then never used it.
//
// `cached` adds stampede locking, null caching and TTL jitter over the plain
// cache-aside helper. Keys are versioned so invalidation is one INCR rather
// than a SCAN across the keyspace.

// These two back the public product page, so they return ACTIVE listings only.
// The status filter lives inside the cached loader rather than around it: a
// non-ACTIVE product caches as `null` under the same key, so it stays a 404
// for shoppers until moderation bumps the entity version.
//
// Privileged reads deliberately do NOT reuse these keys — see
// getProductForOwner() below.

export async function getProductById(id: string) {
  const version = await entityVersion('product', id);

  return cached(
    `product:v${version}:${id}`,
    CACHE_TTL.PRODUCT_DETAIL,
    async () => {
      const product = await prisma.product.findFirst({
        where:   { id, status: { in: PUBLIC_STATUSES } },
        include: productInclude,
      });
      return product ? formatProduct(product) : null;
    },
  );
}

export async function getProductBySlug(slug: string) {
  const version = await entityVersion('product-slug', slug);

  return cached(
    `product:slug:v${version}:${slug}`,
    CACHE_TTL.PRODUCT_DETAIL,
    async () => {
      const product = await prisma.product.findFirst({
        where:   { slug, status: { in: PUBLIC_STATUSES } },
        include: productInclude,
      });
      return product ? formatProduct(product) : null;
    },
  );
}

/**
 * Privileged single-product read: the owning seller, or an admin.
 *
 * Uncached by design. Sharing the public cache key would let one privileged
 * read populate `product:v1:<id>` with a PENDING_APPROVAL listing that every
 * subsequent anonymous request would then be served.
 *
 * `sellerId` is the ownership assertion — pass it for a seller (404 on someone
 * else's product, which leaks less than 403) and omit it for an admin.
 */
export async function getProductForOwner(id: string, sellerId?: string) {
  const product = await prisma.product.findFirst({
    where:   sellerId ? { id, sellerId } : { id },
    include: productInclude,
  });
  return product ? formatProduct(product) : null;
}

/** Bump every cache key derived from a product. Call after any write. */
async function invalidateProduct(id: string, slug?: string): Promise<void> {
  await bumpEntityVersion('product', id);
  if (slug) await bumpEntityVersion('product-slug', slug);
}

/**
 * Bring a product's derived state back in line with its rows.
 *
 * A product's customer-visible price, stock and availability are all computed
 * from its variants — but the variant routes wrote straight to the table and
 * told nothing else. Verified live: after a seller changed one SKU from
 * 50,000/10-in-stock to 31,000/0-in-stock, the PDP still served 50,000 and
 * showed 10 available for the full 5-minute cache TTL, and the Elasticsearch
 * document still held the old price and stock. A shopper could add a sold-out
 * variant to their basket, and a `maxPrice=35000` search missed a product that
 * by then cost 31,000.
 *
 * Exported so variant.service can call it without owning any of this: cache
 * versioning and index writes stay here, in the module that already does them,
 * so there is still exactly one place that decides what a product looks like
 * downstream.
 *
 * Non-fatal on purpose, like every other index write in this file — a seller's
 * stock edit must not fail because Elasticsearch is unreachable. The cache bump
 * happens first and independently, so a search outage cannot leave the PDP
 * stale as well.
 */
export async function refreshProductProjections(productId: string): Promise<void> {
  const product = await prisma.product.findUnique({
    where:   { id: productId },
    include: productInclude,
  });
  if (!product) return;

  // The cheapest ACTIVE variant is what the customer is shown and what the
  // price filter has to match, so it is recomputed here — the one place every
  // variant write already funnels through.
  const cheapest = product.variants.reduce<number | null>(
    (min, v) => (min === null || Number(v.price) < min ? Number(v.price) : min),
    null,
  );
  const derived = cheapest ?? Number(product.basePrice);
  if (Number(product.minVariantPrice ?? NaN) !== derived) {
    await prisma.product.update({
      where: { id: product.id },
      data:  { minVariantPrice: derived },
    });
    product.minVariantPrice = derived as never;
  }

  await invalidateProduct(product.id, product.slug);

  // Only a published listing belongs in the index; anything else must not be
  // findable, which is the same rule moderateProduct applies.
  if (product.status === 'ACTIVE') {
    await addToSearchIndex(product as ProductWithRelations);
  } else {
    await removeFromSearchIndex(product.id);
  }
}

/**
 * A SKU for a variant the seller did not name.
 *
 * variant.service's generateSKU is not reused here for two reasons: it derives
 * its uniqueness suffix from `Date.now()`, so several variants created inside
 * one transaction land in the same millisecond and collide; and with the empty
 * attribute map a no-options product has, it produces a doubled separator
 * ("ABC--K3J9"). `sku` is globally @unique, so a collision is not a cosmetic
 * problem — it aborts the whole create.
 *
 * `index` disambiguates within a request; the random tail disambiguates across
 * concurrent requests from different sellers using the same slug.
 */
function defaultSku(slug: string, attributes: Record<string, string>, index: number): string {
  const prefix = slug
    .split('-')
    .slice(0, 3)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('') || 'SKU';

  const attrPart = Object.values(attributes)
    .map((value) => value.toUpperCase().replace(/\s+/g, '-').slice(0, 5))
    .filter(Boolean)
    .join('-');

  const tail = Math.random().toString(36).slice(2, 6).toUpperCase();

  // Segments are filtered so an empty attribute map cannot produce "ABC--TAIL".
  return [prefix, attrPart, String(index + 1), tail].filter(Boolean).join('-');
}

/**
 * A slug nobody else is using.
 *
 * `slug` is `@unique` platform-wide, and every client derives it from the
 * product name — seller-center slugifies the name in products.api.ts, the bulk
 * importer does the same. On a marketplace that means collisions are the norm,
 * not the exception: the second seller to list an "iPhone 13 Case" sent the
 * slug `iphone-13-case`, Prisma raised P2002, and `create` answered 500 with
 * the raw constraint message. The seller saw "Failed to create product" and had
 * no way to find out that the only problem was a name someone else had used.
 *
 * Resolved here rather than in the client, which cannot see other sellers'
 * listings, and cannot see a product created between its check and its write.
 * The suffix is appended to the slug only — `name` is left exactly as typed, so
 * two sellers can both list "iPhone 13 Case" and each keeps their own title.
 *
 * The loop is bounded and the unique index remains the real guarantee: a
 * concurrent create taking the same suffix simply fails the insert, and the
 * caller retries. `Date.now()` is deliberately not used as the suffix — several
 * creates inside one millisecond would collide exactly as they did for SKUs
 * (see defaultSku).
 */
async function availableSlug(
  tx: Prisma.TransactionClient,
  desired: string,
): Promise<string> {
  const taken = await tx.product.findUnique({ where: { slug: desired }, select: { id: true } });
  if (!taken) return desired;

  // Room for the suffix inside the schema's 255-char ceiling.
  const stem = desired.slice(0, 240);

  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = `${stem}-${Math.random().toString(36).slice(2, 7)}`;
    const clash = await tx.product.findUnique({ where: { slug: candidate }, select: { id: true } });
    if (!clash) return candidate;
  }

  throw Object.assign(
    new Error('Could not generate a unique URL for this product. Please adjust the name slightly.'),
    { status: 409 },
  );
}

export async function createProduct(sellerId: string, input: CreateProductInput) {
  const validated = CreateProductSchema.parse(input);

  // `variants` is a nested write, not a column — it must not reach product.create's
  // `data` spread, which would fail at runtime on an unknown field.
  const { variants, ...productFields } = validated;

  // No variants supplied means one default variant, not zero. See the note on
  // the schema field above: zero variants is an unsellable product.
  const specs = variants && variants.length > 0
    ? variants
    : [{
        attributes:        {} as Record<string, string>,
        stock:             0,
        lowStockThreshold: 5,
        images:            [] as string[],
        sku:               undefined as string | undefined,
        price:             undefined as number | undefined,
        compareAtPrice:    undefined as number | undefined,
      }];

  // One transaction: a product that committed without its variants would be
  // exactly the unsellable row this function exists to stop creating.
  return prisma.$transaction(async (tx) => {
    const slug = await availableSlug(tx, productFields.slug);

    const product = await tx.product.create({
      data: {
        ...productFields,
        slug,
        sellerId,
        // Stamped only when the listing actually enters the queue, so the admin
        // view can order by "waiting longest" without treating drafts as pending.
        submittedAt: productFields.status === 'PENDING_APPROVAL' ? new Date() : null,
        // The cheapest SKU this product is being created with. Derived here
        // rather than left null so the listing filters correctly from its very
        // first read, without waiting for a later variant write to populate it.
        minVariantPrice: specs.reduce(
          (min, v) => Math.min(min, v.price ?? productFields.basePrice),
          Number.POSITIVE_INFINITY,
        ),
      },
    });

    await tx.productVariant.createMany({
      data: specs.map((variant, index) => ({
        productId:         product.id,
        // The resolved slug, not the requested one: a generated SKU should
        // match the listing it belongs to.
        sku:               variant.sku ?? defaultSku(slug, variant.attributes, index),
        attributes:        variant.attributes,
        // The seller typed one price on the form; a single-variant product
        // should not require them to type it again.
        price:             variant.price ?? productFields.basePrice,
        compareAtPrice:    variant.compareAtPrice ?? productFields.compareAtPrice ?? null,
        stock:             variant.stock,
        lowStockThreshold: variant.lowStockThreshold,
        images:            variant.images,
      })),
    });

    // Re-read through productInclude so the response carries the variants that
    // were just written — createMany returns a count, not rows.
    return tx.product.findUniqueOrThrow({
      where:   { id: product.id },
      include: productInclude,
    });
  });
}

/**
 * Fields whose change invalidates a prior approval.
 *
 * Without this, moderation is trivially defeated: submit a clean listing, wait
 * for approval, then PUT a different name, price, images and description onto
 * the same live record. Editing any of these sends the product back to the
 * queue. Stock and variant changes deliberately do not — restocking a approved
 * product should not pull it off the storefront.
 */
const RE_MODERATION_FIELDS = [
  'name', 'description', 'images', 'basePrice', 'compareAtPrice', 'categoryId', 'brand', 'slug',
] as const satisfies readonly (keyof CreateProductInput)[];

/**
 * The create schema, relaxed to a patch.
 *
 * Update accepted whatever it was handed and spread it into prisma.update, so
 * none of the create-time rules applied on edit — including ImageUrlSchema.
 * A listing could be created with clean http(s) images and then edited to carry
 * `javascript:…`, which is rendered into an <img src> on the storefront. Every
 * other field was equally unchecked: a negative basePrice, a 3000-character
 * name, a slug with spaces.
 *
 * `.partial()` keeps update a patch — an absent field is left alone, it is not
 * reset to a default — while every field that IS present is validated exactly
 * as it would be on create.
 */
const UpdateProductSchema = CreateProductSchema.partial();

export async function updateProduct(id: string, sellerId: string, input: Partial<CreateProductInput>) {
  // Ownership check
  const existing = await prisma.product.findUniqueOrThrow({ where: { id } });
  if (existing.sellerId !== sellerId) throw Object.assign(new Error('Forbidden'), { status: 403 });

  // Validated AFTER the ownership check, so a stranger probing another seller's
  // listing gets 403 rather than a 422 that confirms the product exists.
  input = UpdateProductSchema.parse(input) as Partial<CreateProductInput>;

  // `variants` is accepted on create as a nested write; on update it is not a
  // column and is deliberately ignored rather than silently mass-replacing a
  // seller's SKUs. Editing stock or options goes through the variant routes
  // (POST/PUT/DELETE /products/:id/variants), which check ownership per SKU
  // and leave the moderation state alone.
  const { variants: _ignoredVariants, ...fields } = input;

  const touchesModeratedField = RE_MODERATION_FIELDS.some(
    (field) => fields[field] !== undefined && !isEqual(fields[field], existing[field]),
  );

  // Only a listing that is actually published (or was already declined) needs
  // to re-enter the queue. A DRAFT stays a draft; something already pending
  // stays pending without resetting its place in line.
  const needsReview =
    touchesModeratedField && (existing.status === 'ACTIVE' || existing.status === 'REJECTED');

  const updated = await prisma.product.update({
    where: { id },
    data: needsReview
      ? {
          ...fields,
          status:          'PENDING_APPROVAL',
          submittedAt:     new Date(),
          rejectionReason: null,
          moderatedAt:     null,
          moderatedBy:     null,
        }
      : fields,
    include: productInclude,
  });

  // The index has to follow every edit, not just the ones that trigger review.
  //
  //   needsReview → the listing left the storefront, so it must leave the index
  //     too, or it keeps appearing in results under its edited but unreviewed
  //     name and price.
  //
  //   still ACTIVE → the edit is live, so the index must carry it. Without this
  //     branch a seller could correct a price, a name or a description and
  //     search would keep serving the old copy indefinitely — there is no
  //     other write path, no event stream, and nothing that expires a document.
  //     Only moderation ever refreshed the index, so a product was indexed once
  //     at approval and then frozen.
  //
  //   anything else (DRAFT, ARCHIVED, still PENDING) → not publicly visible, so
  //     not indexed.
  if (needsReview) {
    await removeFromSearchIndex(updated.id);
  } else if (updated.status === 'ACTIVE') {
    await addToSearchIndex(updated);
  }

  // Invalidate under both the old and new slug — renaming a product otherwise
  // leaves the previous slug serving a stale copy until its TTL expires.
  await invalidateProduct(id, existing.slug);
  if (updated.slug !== existing.slug) await bumpEntityVersion('product-slug', updated.slug);

  // ── Price change → product-events ────────────────────────────────────────
  //
  // wishlist-service subscribes to `product-events` and, on `price.updated`,
  // updates every wishlist holding this product and emits `price.drop.alert`
  // when the new price is lower. That consumer and its handler are fully
  // implemented — indexed lookup, stored-price update, alert publish — and had
  // simply never received a message, because NOTHING published to the topic.
  // The price-drop feature the storefront advertises has never fired once.
  //
  // Published only on an actual change, and only for a listing customers can
  // see: a draft's price is not news, and re-publishing an unchanged price
  // would have every wishlist rewrite itself on every unrelated edit.
  const previousPrice = Number(existing.basePrice);
  const currentPrice  = Number(updated.basePrice);

  if (updated.status === 'ACTIVE' && currentPrice !== previousPrice) {
    // Keyed by product id so all events for one product land on one partition
    // and stay ordered — two rapid price edits must not be applied backwards.
    //
    // Deliberately not awaited into the caller's failure path: publish() is
    // already non-fatal (it logs and drops when the broker is unreachable), and
    // a price edit must not fail because Kafka is down.
    void publish(
      Topics.PRODUCT_EVENTS,
      {
        type: 'price.updated',
        payload: {
          productId: updated.id,
          oldPrice:  previousPrice,
          newPrice:  currentPrice,
          currency:  updated.currency,
        },
      },
      updated.id,
    ).catch((err) => {
      console.warn('[product-service] price.updated publish failed:', (err as Error).message);
    });
  }

  return updated;
}

export async function deleteProduct(id: string, sellerId: string) {
  const existing = await prisma.product.findUniqueOrThrow({ where: { id } });
  if (existing.sellerId !== sellerId) throw Object.assign(new Error('Forbidden'), { status: 403 });

  const archived = await prisma.product.update({
    where: { id },
    data:  { status: 'ARCHIVED' },
  });

  await invalidateProduct(id, existing.slug);
  // An archived product must stop appearing in search, not just in SQL browse.
  await removeFromSearchIndex(id);
  return archived;
}

// ── Moderation ────────────────────────────────────────────────────────────────

/**
 * The seller's own catalogue — every status, scoped to one seller.
 *
 * Uncached and separate from listProducts() on purpose: a seller must see their
 * PENDING_APPROVAL and REJECTED rows, and mixing those into the public helper
 * risks one shared cache key serving unapproved listings to shoppers.
 */
export async function listSellerProducts(sellerId: string, rawQuery: unknown) {
  const params = ModerationQueueSchema.partial({ status: true }).parse(rawQuery);

  const where: Prisma.ProductWhereInput = { sellerId };
  if (params.status) where.status = params.status;
  if (params.q)      where.name   = { contains: params.q, mode: 'insensitive' };

  const [data, total] = await prisma.$transaction([
    prisma.product.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip:    params.page * params.limit,
      take:    params.limit,
      include: productInclude,
    }),
    prisma.product.count({ where }),
  ]);

  return {
    data: data.map(formatProduct),
    meta: {
      current_page: params.page,
      last_page:    Math.max(0, Math.ceil(total / params.limit) - 1),
      per_page:     params.limit,
      total,
    },
  };
}

/**
 * The admin moderation queue. Defaults to PENDING_APPROVAL, oldest submission
 * first — the order the [status, submittedAt ASC] index is built for.
 */
export async function listModerationQueue(rawQuery: unknown) {
  const params = ModerationQueueSchema.parse(rawQuery);

  const where: Prisma.ProductWhereInput = { status: params.status };
  if (params.sellerId) where.sellerId = params.sellerId;
  if (params.q)        where.name     = { contains: params.q, mode: 'insensitive' };

  const [data, total] = await prisma.$transaction([
    prisma.product.findMany({
      where,
      // Oldest first: a queue is worked front-to-back. NULL submittedAt (legacy
      // rows that predate moderation) sorts last rather than jumping the line.
      orderBy: [{ submittedAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
      skip:    params.page * params.limit,
      take:    params.limit,
      include: productInclude,
    }),
    prisma.product.count({ where }),
  ]);

  return {
    data: data.map(formatProduct),
    meta: {
      current_page: params.page,
      last_page:    Math.max(0, Math.ceil(total / params.limit) - 1),
      per_page:     params.limit,
      total,
    },
  };
}

/** Counts per status — drives the queue badges in the admin panel. */
export async function getModerationCounts() {
  const rows = await prisma.product.groupBy({ by: ['status'], _count: { _all: true } });
  return Object.fromEntries(rows.map((r) => [r.status, r._count._all])) as Record<ProductStatus, number>;
}

/**
 * Approve or reject a pending listing. Admin-only — the caller is authorised by
 * the gateway's requireRole('ROLE_ADMIN', …) guard before this is ever reached.
 */
export async function moderateProduct(id: string, adminId: string, input: ModerateProductInput) {
  const { action, reason } = ModerateProductSchema.parse(input);

  const existing = await prisma.product.findUniqueOrThrow({ where: { id } });

  // Moderating an archived listing is almost always a stale tab re-submitting an
  // action against a product that has since been withdrawn.
  if (existing.status === 'ARCHIVED') {
    throw Object.assign(new Error('Cannot moderate an archived product'), { status: 409 });
  }

  const approved = action === 'approve';

  const updated = await prisma.product.update({
    where: { id },
    data: {
      status:          approved ? 'ACTIVE' : 'REJECTED',
      rejectionReason: approved ? null : (reason ?? null),
      moderatedAt:     new Date(),
      moderatedBy:     adminId,
    },
    include: productInclude,
  });

  await invalidateProduct(id, existing.slug);

  // Search index follows the decision: approval is what makes a product
  // findable, rejection is what must remove it.
  if (approved) {
    await addToSearchIndex(updated);
  } else {
    await removeFromSearchIndex(id);
  }

  // ── Price visibility → product-events ────────────────────────────────────
  //
  // Approval is where a price becomes real to customers, so it is where the
  // event has to be published.
  //
  // updateProduct also publishes on a price change, but that branch can never
  // fire for a live listing and this was only visible by running it: `basePrice`
  // is in RE_MODERATION_FIELDS, so editing an ACTIVE product's price sets
  // needsReview and the row comes back PENDING_APPROVAL — while the publish
  // there requires status === 'ACTIVE'. The two conditions are mutually
  // exclusive for the exact field the event is about, so a seller lowering a
  // price emitted nothing and no wishlist was ever told.
  //
  // The current price is published rather than a delta: wishlist-service
  // compares it against its OWN stored `currentPrice` per holding and decides
  // whether that is a drop, so this is correct and idempotent even if the same
  // approval is replayed.
  if (approved) {
    void publish(
      Topics.PRODUCT_EVENTS,
      {
        type: 'price.updated',
        payload: {
          productId: updated.id,
          newPrice:  Number(updated.basePrice),
          currency:  updated.currency,
        },
      },
      updated.id,
    ).catch((err) => {
      console.warn('[product-service] price.updated publish failed:', (err as Error).message);
    });
  }

  return formatProduct(updated);
}

// ── Search index sync ─────────────────────────────────────────────────────────
//
// Elasticsearch is an optional dependency here (see app.ts — the index bootstrap
// is non-fatal), so neither helper may throw: a moderation decision must commit
// to Postgres whether or not ES is reachable. Postgres remains the source of
// truth, and searchViaElasticsearch() re-filters hits on status, so a stale
// index degrades result counts rather than leaking an unapproved listing.

/**
 * Build the Elasticsearch document for a product.
 *
 * Extracted so the incremental path (addToSearchIndex) and the bulk path
 * (reindexAllProducts) cannot drift — two builders would eventually disagree,
 * and a document that differs depending on which code path wrote it is the
 * hardest kind of search bug to see.
 */
function toSearchDocument(p: ProductWithRelations) {
  // Sellable units, not shelf units: stock already committed to an in-flight
  // cart cannot be sold again, so `reserved` comes off before this decides
  // whether the product is findable as in-stock.
  const available = p.variants.reduce(
    (total, v) => total + Math.max(0, v.stock - v.reserved),
    0,
  );
  const lowStock = p.variants.some(
    (v) => v.stock - v.reserved > 0 && v.stock - v.reserved <= v.lowStockThreshold,
  );

  return {
    id:          p.id,
    name:        p.name,
    description: p.description ?? '',
    slug:        p.slug,
    brand:       p.brand ?? null,
    sellerId:    p.sellerId,
    category: {
      id:   p.categoryId,
      slug: p.category?.slug ?? null,
      name: p.category?.name ?? null,
      path: p.category?.path ?? null,
    },
    tags:        p.tags,
    // `price` keeps its existing meaning — the seller's product-level list
    // price — so nothing that already reads it changes. The filterable figure
    // is the new, explicitly named field beside it.
    price:       Number(p.basePrice),
    minVariantPrice: p.minVariantPrice !== null && p.minVariantPrice !== undefined
      ? Number(p.minVariantPrice)
      : Number(p.basePrice),
    currency:    p.currency,
    rating:      p.averageRating,
    reviewCount: p.reviewCount,
    stock:       available,
    inStock:     available > 0,
    stockStatus: (available === 0 ? 'out_of_stock' : lowStock ? 'low_stock' : 'in_stock') as
      'in_stock' | 'low_stock' | 'out_of_stock',
    images:      p.images,
    status:      p.status,
    createdAt:   p.createdAt.toISOString(),
    updatedAt:   p.updatedAt.toISOString(),
    // Populated once an embedding service is wired up. Written explicitly so
    // the field is present on every document rather than only on some.
    embedding:   null,
  };
}

/**
 * Index one product, swallowing failures.
 *
 * Deliberately non-fatal: Elasticsearch being unreachable must not fail a
 * seller's save or an admin's approval. The cost is that the index can fall
 * behind silently, which is what reindexAllProducts exists to repair.
 */
async function addToSearchIndex(p: ProductWithRelations): Promise<void> {
  try {
    await indexProduct(toSearchDocument(p));
  } catch (err) {
    console.warn('[product-service] Search index write failed:', (err as Error).message);
  }
}

async function removeFromSearchIndex(id: string): Promise<void> {
  try {
    await deleteProductFromIndex(id);
  } catch (err) {
    console.warn('[product-service] Search index delete failed:', (err as Error).message);
  }
}

/**
 * Rebuild the search index from the database.
 *
 * The index is written incrementally — on approval, on edit, on archive — which
 * is correct in steady state but has no way to recover from the cases where
 * that stream is not the whole truth:
 *
 *   • Elasticsearch was down when a product changed. Index writes are
 *     deliberately non-fatal (a failed index write must not fail a seller's
 *     save), so the product is simply missing until something rewrites it.
 *   • The mapping changed, as it just did.
 *   • The index was created fresh, or wiped.
 *
 * Without this, the only route back to a correct index is editing every product
 * by hand.
 *
 * Reads in pages rather than one findMany: a full catalogue in memory at once
 * is the kind of thing that works on a seed database and OOMs on a real one.
 * Failures are counted and reported rather than thrown — one bad document
 * should not abandon the other nine thousand.
 */
export async function reindexAllProducts(
  { batchSize = 200 }: { batchSize?: number } = {},
): Promise<{ indexed: number; failed: number; total: number }> {
  // Creates the index if it is absent, so a reindex onto a fresh Elasticsearch
  // works without a separate bootstrap step.
  await ensureIndex();

  const total = await prisma.product.count({ where: { status: 'ACTIVE' } });

  let indexed = 0;
  let failed = 0;
  let cursor: string | undefined;

  for (;;) {
    const batch = await prisma.product.findMany({
      where:   { status: 'ACTIVE' },
      include: productInclude,
      orderBy: { id: 'asc' },
      take:    batchSize,
      // Cursor pagination, not skip/take: skip re-scans everything it skips, so
      // the last page of a large catalogue costs the most.
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });

    if (batch.length === 0) break;

    for (const product of batch) {
      try {
        // Not addToSearchIndex: that swallows its error to keep a seller's save
        // from failing, which would make every document here look successful.
        await indexProduct(toSearchDocument(product));
        indexed += 1;
      } catch (err) {
        failed += 1;
        console.warn(
          `[product-service] Reindex failed for ${product.id}:`,
          (err as Error).message,
        );
      }
    }

    cursor = batch[batch.length - 1].id;
    if (batch.length < batchSize) break;
  }

  console.log(`[product-service] Reindex complete: ${indexed} indexed, ${failed} failed, ${total} active`);
  return { indexed, failed, total };
}

/** Trending never returns more than this, whatever the caller asks for. */
export const TRENDING_LIMIT = 20;

/**
 * Products currently getting attention.
 *
 * `GET /api/v1/products/trending` was an alias for `list()` with no parameters,
 * and the comment beside it claimed "list() handles sort=newest". It did not
 * even do that: the route passes no `sort`, so ListProductsSchema defaults to
 * `relevance`, which with no `q` falls through to `createdAt desc`. "Trending"
 * was therefore "most recently added" — a brand-new listing nobody had opened
 * outranked the thing the whole country was buying.
 *
 * The score is deliberately simple, because the data to do better is not there:
 * Product carries `viewCount`, `averageRating` and `reviewCount`, and there is
 * no sales or add-to-cart counter on the row. So:
 *
 *   views           — the only direct engagement signal available
 *   reviewCount     — a weak proxy for purchases; you review what you bought
 *   averageRating   — quality, so a heavily-viewed bad product does not lead
 *   recency decay   — halves roughly every 30 days, so trending means "now"
 *                     rather than "accumulated views since launch", which is
 *                     what separates this from an all-time popularity list
 *
 * Raw SQL because the score is a computed expression: Prisma's orderBy takes
 * columns, not arithmetic, so the alternative is fetching the candidate set and
 * sorting in Node — which means pulling the whole ACTIVE catalogue into memory
 * on every request.
 *
 * KNOWN COST: ordering by a computed expression cannot use an index, so this
 * sorts every ACTIVE row. Fine at the catalogue size this runs on today, and
 * the result is a good candidate for a short cache since it changes slowly —
 * but the real fix at scale is a materialised `trendingScore` column refreshed
 * on a schedule, which this query then reads with an index. Do that before the
 * catalogue outgrows a sequential sort, not after.
 */
export async function getTrendingProducts(limit = TRENDING_LIMIT) {
  const take = Math.min(Math.max(Math.trunc(limit) || TRENDING_LIMIT, 1), TRENDING_LIMIT);

  // Two steps rather than one query with an include: raw SQL cannot hydrate
  // Prisma relations, and formatProduct needs variants and category. The first
  // query returns ids in score order, the second fetches them properly.
  // `"Product"`, quoted and PascalCase. This schema declares no `@@map`, so
  // Prisma created the table under the model name verbatim — an unquoted
  // `products` is a different, non-existent relation and Postgres answers
  // `relation "products" does not exist`. category.service.ts's raw queries
  // already spell it `"Category"` for the same reason.
  const ranked = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id
    FROM "Product"
    WHERE status = 'ACTIVE'
    ORDER BY (
      (LOG(10, GREATEST("viewCount", 0) + 1) * 1.0)
      + (LOG(10, GREATEST("reviewCount", 0) + 1) * 1.5)
      + (COALESCE("averageRating", 0) * 0.5)
    ) * POWER(
      0.5,
      EXTRACT(EPOCH FROM (NOW() - "createdAt")) / (30 * 24 * 60 * 60)
    ) DESC
    LIMIT ${take}
  `;

  const ids = ranked.map((row) => row.id);
  if (ids.length === 0) return { data: [], meta: { total: 0, limit: take } };

  const rows = await prisma.product.findMany({
    where:   { id: { in: ids }, status: 'ACTIVE' },
    include: productInclude,
  });

  // Postgres returns IN() rows in whatever order it finds them, which would
  // discard the ranking the first query just computed.
  const byId = new Map(rows.map((row) => [row.id, row]));
  const data = ids
    .map((id) => byId.get(id))
    .filter((row): row is NonNullable<typeof row> => row !== undefined)
    .map(formatProduct);

  return { data, meta: { total: data.length, limit: take } };
}

export async function getRelatedProducts(productId: string, limit = 6) {
  const product = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
  return prisma.product.findMany({
    where: {
      categoryId: product.categoryId ?? undefined,
      status:     'ACTIVE',
      id:         { not: productId },
    },
    include: {
      category: { select: { id: true, name: true, slug: true } },
      variants: { where: { active: true }, take: 3 },
    },
    orderBy: { averageRating: 'desc' },
    take: limit,
  });
}

export async function incrementViewCount(id: string) {
  await prisma.product.update({ where: { id }, data: { viewCount: { increment: 1 } } });
}

export async function recalculateRating(productId: string) {
  const result = await prisma.review.aggregate({
    where: { productId },
    _avg:  { rating: true },
    _count: true,
  });
  await prisma.product.update({
    where: { id: productId },
    data: {
      averageRating: result._avg.rating ?? 0,
      reviewCount:   result._count,
    },
  });
  // A new review changes the cached detail payload.
  await invalidateProduct(productId);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Value comparison for the re-moderation check.
 *
 * A plain `!==` would flag every PUT that echoes the product back unchanged —
 * which is exactly what an edit form does — and bounce approved listings into
 * the queue for no reason. Two cases need care: `images`/`tags` are arrays
 * (reference-unequal even when identical) and `basePrice` arrives as a JS
 * number but is stored as a Prisma Decimal.
 */
function isEqual(next: unknown, current: unknown): boolean {
  if (Array.isArray(next) && Array.isArray(current)) {
    return next.length === current.length && next.every((v, i) => v === current[i]);
  }
  // Decimal (and Date) — compare by string form rather than identity.
  if (current !== null && typeof current === 'object') {
    return String(next) === String(current);
  }
  return next === current;
}

const productInclude = {
  category: { select: { id: true, name: true, slug: true, path: true } },
  variants: {
    where:   { active: true },
    orderBy: { price: 'asc' as const },
  },
  reviews: {
    orderBy: { createdAt: 'desc' as const },
    take: 5,
  },
} satisfies Prisma.ProductInclude;

type ProductWithRelations = Prisma.ProductGetPayload<{ include: typeof productInclude }>;

/** Normalise DB product to match the legacy API shape the frontend expects */
function formatProduct(p: ProductWithRelations) {
  const lowestVariant = p.variants[0];
  return {
    id:              p.id,
    name:            p.name,
    slug:            p.slug,
    description:     p.description,
    sku:             lowestVariant?.sku ?? p.id,
    price:           lowestVariant ? Number(lowestVariant.price) : Number(p.basePrice),
    compareAtPrice:  lowestVariant?.compareAtPrice ? Number(lowestVariant.compareAtPrice) : (p.compareAtPrice ? Number(p.compareAtPrice) : null),
    currency:        p.currency,
    stockQuantity:   p.variants.reduce((sum, v) => sum + Math.max(0, v.stock - v.reserved), 0),
    inStock:         p.variants.some((v) => v.stock - v.reserved > 0),
    lowStock:        p.variants.some((v) => v.stock - v.reserved > 0 && v.stock - v.reserved <= v.lowStockThreshold),
    weightKg:        null,
    category:        p.category,
    brand:           p.brand,
    sellerId:        p.sellerId,
    status:          p.status,
    // Moderation state travels with the product so the seller can see why a
    // listing was declined and the admin queue can render its badges without a
    // second round-trip. Null on every public (ACTIVE) listing, so this leaks
    // nothing to shoppers.
    rejectionReason: p.rejectionReason,
    submittedAt:     p.submittedAt?.toISOString() ?? null,
    moderatedAt:     p.moderatedAt?.toISOString() ?? null,
    averageRating:   p.averageRating,
    reviewCount:     p.reviewCount,
    viewCount:       p.viewCount,
    imageUrls:       p.images.length > 0 ? p.images : (lowestVariant?.images ?? []),
    tags:            p.tags,
    variants:        p.variants.map((v) => ({
      ...v,
      price:          Number(v.price),
      compareAtPrice: v.compareAtPrice ? Number(v.compareAtPrice) : null,
      availableStock: v.stock - v.reserved,
      inStock:        v.stock - v.reserved > 0,
    })),
    createdAt:       p.createdAt.toISOString(),
    updatedAt:       p.updatedAt.toISOString(),
  };
}
