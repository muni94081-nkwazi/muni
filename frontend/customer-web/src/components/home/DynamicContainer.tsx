import { Link } from 'react-router-dom';
import { useCurrency } from '@/hooks/useCurrency';
import { OptimizedImage } from '@/components/common/OptimizedImage/OptimizedImage';

export interface ContainerProductDetails {
  id: string;
  name: string;
  slug: string;
  price: number;
  originalPrice?: number;
  currency: string;
  rating: number;
  reviewsCount: number;
  image: string;
  category?: string;
  inStock: boolean;
  badge?: string;
  sellerName?: string;
}

export interface ContainerProductItem {
  id: string;
  productId: string;
  sortOrder: number;
  productDetails?: ContainerProductDetails;
}

export interface ContainerData {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
  type: string;
  icon?: string | null;
  displayMode: 'grid' | 'carousel' | 'list' | 'featured';
  itemsPerRow: number;
  maxItems: number;
  bgColor?: string | null;
  products: ContainerProductItem[];
}

interface Props {
  container: ContainerData;
}

export function DynamicContainer({ container }: Props) {
  // Container prices are catalogue prices, so they follow the market selector
  // like every other price in the app. formatMoney() renders the settled
  // amount under its own currency code and converts nothing, which put an
  // unconverted figure beside converted ones on the same page.
  const { format: formatMoney } = useCurrency();
  const { name, description, icon, displayMode, itemsPerRow, bgColor, products } = container;

  const validProducts = products
    .map((p) => p.productDetails)
    .filter((p): p is ContainerProductDetails => p !== undefined);

  if (validProducts.length === 0) return null;

  return (
    <section
      style={{
        background: bgColor || 'var(--color-surface)',
        borderRadius: 'var(--radius-lg)',
        padding: 'var(--space-6)',
        marginBottom: 'var(--space-8)',
        border: '1px solid var(--color-border)',
        boxShadow: '0 2px 10px rgba(0,0,0,0.03)',
      }}
    >
      {/* Section Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-5)' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            {icon && <span style={{ fontSize: '1.5rem' }}>{icon}</span>}
            <h2 style={{ fontSize: 'var(--text-xl)', fontWeight: 800, color: 'var(--color-text-primary)' }}>{name}</h2>
          </div>
          {description && (
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', marginTop: '2px' }}>{description}</p>
          )}
        </div>

        <Link
          to={`/products?container=${container.slug}`}
          style={{
            fontSize: 'var(--text-xs)',
            fontWeight: 700,
            color: 'var(--color-primary)',
            textDecoration: 'none',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
          }}
        >
          View All →
        </Link>
      </div>

      {/* Grid Layout Mode */}
      {displayMode === 'grid' && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${itemsPerRow}, 1fr)`,
            gap: 'var(--space-4)',
          }}
        >
          {validProducts.slice(0, container.maxItems).map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      )}

      {/* Carousel Horizontal Layout Mode */}
      {displayMode === 'carousel' && (
        <div
          style={{
            display: 'flex',
            gap: 'var(--space-4)',
            overflowX: 'auto',
            paddingBottom: 'var(--space-2)',
            scrollbarWidth: 'thin',
          }}
        >
          {validProducts.slice(0, container.maxItems).map((p) => (
            <div key={p.id} style={{ minWidth: 260, flexShrink: 0 }}>
              <ProductCard product={p} />
            </div>
          ))}
        </div>
      )}

      {/* Featured Hero Mode */}
      {displayMode === 'featured' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-6)', alignItems: 'center' }}>
          {validProducts[0] && (
            <>
              <OptimizedImage
                src={validProducts[0].image}
                width={640}
                height={320}
                sizes="(max-width: 768px) 100vw, 640px"
                alt={validProducts[0].name}
                style={{ width: '100%', height: 320, objectFit: 'cover', borderRadius: 'var(--radius-md)' }}
              />
              <div>
                {validProducts[0].badge && (
                  <span style={{ background: '#ef4444', color: '#fff', fontSize: 'var(--text-xs)', fontWeight: 800, padding: '4px 12px', borderRadius: '12px' }}>
                    {validProducts[0].badge}
                  </span>
                )}
                <h3 style={{ fontSize: 'var(--text-2xl)', fontWeight: 800, marginTop: 'var(--space-3)', marginBottom: 'var(--space-2)' }}>
                  {validProducts[0].name}
                </h3>
                <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-4)' }}>
                  ★ {validProducts[0].rating} ({validProducts[0].reviewsCount} reviews) • Sold by {validProducts[0].sellerName || 'MUNI Partner'}
                </p>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-3)', marginBottom: 'var(--space-5)' }}>
                  <span style={{ fontSize: 'var(--text-3xl)', fontWeight: 900, color: 'var(--color-primary)' }}>
                    {formatMoney(validProducts[0].price, validProducts[0].currency)}
                  </span>
                  {validProducts[0].originalPrice && validProducts[0].originalPrice > validProducts[0].price && (
                    <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', textDecoration: 'line-through' }}>
                      {formatMoney(validProducts[0].originalPrice, validProducts[0].currency)}
                    </span>
                  )}
                </div>
                <Link
                  to={`/products/${validProducts[0].slug}`}
                  style={{
                    padding: '12px 28px',
                    background: 'var(--color-primary)',
                    color: '#fff',
                    borderRadius: 'var(--radius-md)',
                    textDecoration: 'none',
                    fontWeight: 800,
                    display: 'inline-block',
                  }}
                >
                  Shop Featured Deal Now
                </Link>
              </div>
            </>
          )}
        </div>
      )}

      {/* List Compact Mode */}
      {displayMode === 'list' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {validProducts.slice(0, container.maxItems).map((p) => (
            <div
              key={p.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-4)',
                padding: 'var(--space-3)',
                background: '#ffffff',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)',
              }}
            >
              <OptimizedImage src={p.image} width={64} height={64} sizes="64px" alt={p.name} style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 'var(--radius-sm)' }} />
              <div style={{ flex: 1 }}>
                <Link to={`/products/${p.slug}`} style={{ fontSize: 'var(--text-sm)', fontWeight: 700, textDecoration: 'none', color: 'var(--color-text-primary)' }}>
                  {p.name}
                </Link>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', marginTop: '2px' }}>★ {p.rating}</div>
              </div>
              <span style={{ fontSize: 'var(--text-base)', fontWeight: 800, color: 'var(--color-primary)' }}>{formatMoney(p.price, p.currency)}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function ProductCard({ product }: { product: ContainerProductDetails }) {
  const { format: formatMoney } = useCurrency();

  return (
    <div
      style={{
        background: '#ffffff',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-md)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        position: 'relative',
      }}
    >
      {product.badge && (
        <span
          style={{
            position: 'absolute',
            top: 10,
            left: 10,
            background: '#ef4444',
            color: '#ffffff',
            fontSize: '10px',
            fontWeight: 800,
            padding: '2px 8px',
            borderRadius: '10px',
            zIndex: 2,
          }}
        >
          {product.badge}
        </span>
      )}

      <OptimizedImage src={product.image} width={240} height={160} sizes="(max-width: 768px) 50vw, 240px" alt={product.name} style={{ width: '100%', height: 160, objectFit: 'cover' }} />

      <div style={{ padding: 'var(--space-4)', flex: 1, display: 'flex', flexDirection: 'column' }}>
        <Link
          to={`/products/${product.slug}`}
          style={{
            fontSize: 'var(--text-xs)',
            fontWeight: 700,
            color: 'var(--color-text-primary)',
            textDecoration: 'none',
            lineHeight: 1.4,
            marginBottom: 'var(--space-2)',
          }}
        >
          {product.name}
        </Link>

        <div style={{ marginTop: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginBottom: 'var(--space-2)' }}>
            <span style={{ fontSize: 'var(--text-sm)', fontWeight: 800, color: 'var(--color-primary)' }}>
              {formatMoney(product.price, product.currency)}
            </span>
            {product.originalPrice && product.originalPrice > product.price && (
              <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)', textDecoration: 'line-through' }}>
                {formatMoney(product.originalPrice, product.currency)}
              </span>
            )}
          </div>
          <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>★ {product.rating} ({product.reviewsCount})</span>
        </div>
      </div>
    </div>
  );
}
