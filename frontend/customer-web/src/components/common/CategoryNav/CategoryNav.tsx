import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import styles from './CategoryNav.module.css';

// The flyout promos are text only. Each category used to carry a
// `promoImage` pointing at placehold.co — an external placeholder service
// rendering grey "TVs" / "Phones" boxes, on the critical path of the nav, in
// production. MUNI has no category artwork (public/assets holds logos and
// favicons), and inventing marketing imagery to fill the slot would be worse
// than leaving it out, so the promo is now just its label.
//
// To restore artwork, add a real asset, import it (the bundler turns the
// import into a URL) and render it here.

type SubLink = { label: string; to: string };

type Category = {
  label: string;
  to: string;
  noSub?: boolean;
  popular?: SubLink[];
  more?: SubLink[];
  promoLabel?: string;
};

const CATEGORIES: Category[] = [
  { label: 'Deals', to: '/products?sortBy=price_asc', noSub: true },
  {
    label: 'Electronics',
    to: '/products?category=electronics',
    popular: [
      { label: 'TVs & home audio', to: '/products?category=electronics&sub=tv-audio' },
      { label: 'Laptops & computing', to: '/products?category=electronics&sub=computing' },
      { label: 'Cameras', to: '/products?category=electronics&sub=cameras' },
      { label: 'Speakers & sound systems', to: '/products?category=electronics&sub=speakers' },
    ],
    more: [
      { label: 'Smart home & surveillance', to: '/products?category=electronics&sub=smart-home' },
      { label: 'Printers & office electronics', to: '/products?category=electronics&sub=printers' },
      { label: 'Gaming consoles', to: '/products?category=electronics&sub=gaming' },
      { label: 'Refurbished electronics', to: '/products?category=electronics&sub=refurbished' },
    ],
    promoLabel: 'Free delivery on TVs & fridges',
  },
  {
    label: 'Phones & Tablets',
    to: '/products?category=phones-tablets',
    popular: [
      { label: 'Smartphones', to: '/products?category=phones-tablets&sub=smartphones' },
      { label: 'Tablets', to: '/products?category=phones-tablets&sub=tablets' },
      { label: 'Chargers & power banks', to: '/products?category=phones-tablets&sub=chargers' },
      { label: 'Phone cases & covers', to: '/products?category=phones-tablets&sub=cases' },
    ],
    more: [
      { label: 'Earphones & headsets', to: '/products?category=phones-tablets&sub=audio' },
      { label: 'Smart watches', to: '/products?category=phones-tablets&sub=smart-watches' },
      { label: 'Memory cards & storage', to: '/products?category=phones-tablets&sub=storage' },
      { label: 'Screen protectors', to: '/products?category=phones-tablets&sub=protectors' },
    ],
    promoLabel: '24-month warranty on select phones',
  },
  {
    label: 'Fashion',
    to: '/products?category=fashion',
    popular: [
      { label: "Women's clothing", to: '/products?category=fashion&sub=womens-clothing' },
      { label: "Women's shoes", to: '/products?category=fashion&sub=womens-shoes' },
      { label: "Men's clothing", to: '/products?category=fashion&sub=mens-clothing' },
      { label: "Men's shoes", to: '/products?category=fashion&sub=mens-shoes' },
    ],
    more: [
      { label: 'Bags & handbags', to: '/products?category=fashion&sub=bags' },
      { label: 'Jewelry & watches', to: '/products?category=fashion&sub=jewelry' },
      { label: "Kids' fashion", to: '/products?category=fashion&sub=kids' },
      { label: 'Sunglasses', to: '/products?category=fashion&sub=sunglasses' },
    ],
    promoLabel: 'New arrivals every week',
  },
  {
    label: 'Home & Office',
    to: '/products?category=home-office',
    popular: [
      { label: 'Kitchen appliances', to: '/products?category=home-office&sub=kitchen' },
      { label: 'Furniture', to: '/products?category=home-office&sub=furniture' },
      { label: 'Home decor', to: '/products?category=home-office&sub=decor' },
      { label: 'Cleaning supplies', to: '/products?category=home-office&sub=cleaning' },
    ],
    more: [
      { label: 'Fridges & freezers', to: '/products?category=home-office&sub=fridges' },
      { label: 'Gas cookers & ovens', to: '/products?category=home-office&sub=cookers' },
      { label: 'Bedding & linen', to: '/products?category=home-office&sub=bedding' },
      { label: 'Office supplies', to: '/products?category=home-office&sub=office' },
    ],
    promoLabel: 'Big items, small prices',
  },
  {
    label: 'Health & Beauty',
    to: '/products?category=health-beauty',
    popular: [
      { label: 'Skin care', to: '/products?category=health-beauty&sub=skin-care' },
      { label: 'Makeup', to: '/products?category=health-beauty&sub=makeup' },
      { label: 'Hair care', to: '/products?category=health-beauty&sub=hair-care' },
      { label: 'Fragrances', to: '/products?category=health-beauty&sub=fragrances' },
    ],
    more: [
      { label: 'Personal care appliances', to: '/products?category=health-beauty&sub=appliances' },
      { label: 'Vitamins & supplements', to: '/products?category=health-beauty&sub=vitamins' },
      { label: 'Bath & body', to: '/products?category=health-beauty&sub=bath-body' },
      { label: 'Oral care', to: '/products?category=health-beauty&sub=oral-care' },
    ],
  },
  {
    label: 'Groceries',
    to: '/products?category=groceries',
    popular: [
      { label: 'Rice, sugar & staples', to: '/products?category=groceries&sub=staples' },
      { label: 'Cooking oil', to: '/products?category=groceries&sub=cooking-oil' },
      { label: 'Drinks & beverages', to: '/products?category=groceries&sub=drinks' },
      { label: 'Snacks', to: '/products?category=groceries&sub=snacks' },
    ],
    more: [
      { label: 'Baby formula & food', to: '/products?category=groceries&sub=baby-food' },
      { label: 'Household supplies', to: '/products?category=groceries&sub=household' },
      { label: 'Wines & spirits', to: '/products?category=groceries&sub=wines-spirits' },
    ],
    promoLabel: 'Free delivery on orders over UGX 200,000',
  },
];

type CategoryNavProps = {
  /** Whether the mobile drawer (opened via Navbar's hamburger button) is visible. */
  isMobileOpen: boolean;
  /** Called when the drawer should close — backdrop click, ✕ button, or a link tap. */
  onCloseMobile: () => void;
};

export function CategoryNav({ isMobileOpen, onCloseMobile }: CategoryNavProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [expandedMobileIndex, setExpandedMobileIndex] = useState<number | null>(null);

  function openFlyout(index: number) {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setOpenIndex(index);
  }

  function scheduleClose() {
    closeTimer.current = setTimeout(() => setOpenIndex(null), 120);
  }

  function toggleMobileCategory(index: number) {
    setExpandedMobileIndex((prev) => (prev === index ? null : index));
  }

  // Lock background scroll while the drawer is open, and reset which
  // category is expanded each time it's closed so it reopens fresh.
  useEffect(() => {
    if (!isMobileOpen) {
      setExpandedMobileIndex(null);
      return undefined;
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isMobileOpen]);

  return (
    <nav className={styles.categoryNav} aria-label="Category navigation">
      {/* ---- Desktop hover flyout nav (unchanged) ---- */}
      <ul className={styles.tabList}>
        {CATEGORIES.map((category, index) => {
          const hasFlyout = !category.noSub;
          const isOpen = openIndex === index;

          return (
            <li
              key={category.label}
              className={styles.tab}
              onMouseEnter={() => hasFlyout && openFlyout(index)}
              onMouseLeave={() => hasFlyout && scheduleClose()}
            >
              <Link to={category.to} className={styles.tabLink}>
                {category.label}
                {hasFlyout && <span className={styles.chevron}>▾</span>}
              </Link>

              {hasFlyout && isOpen && (
                <div
                  className={styles.flyout}
                  onMouseEnter={() => openFlyout(index)}
                  onMouseLeave={scheduleClose}
                >
                  <div className={styles.flyoutColumns}>
                    {category.popular && (
                      <div className={styles.flyoutColumn}>
                        <h4 className={styles.flyoutHeading}>Most popular</h4>
                        <ul>
                          {category.popular.map((link) => (
                            <li key={link.label}>
                              <Link to={link.to} className={styles.flyoutLink}>
                                {link.label}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {category.more && (
                      <div className={styles.flyoutColumn}>
                        <h4 className={styles.flyoutHeading}>More categories</h4>
                        <ul>
                          {category.more.map((link) => (
                            <li key={link.label}>
                              <Link to={link.to} className={styles.flyoutLink}>
                                {link.label}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>

                  {category.promoLabel && (
                    <Link to={category.to} className={styles.flyoutPromo}>
                      <span className={styles.flyoutPromoText}>{category.promoLabel}</span>
                    </Link>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {/* ---- Mobile drawer, opened by Navbar's ☰ button ---- */}
      {isMobileOpen && (
        <div className={styles.mobileOverlay} onClick={onCloseMobile}>
          <div
            className={styles.mobileDrawer}
            role="dialog"
            aria-modal="true"
            aria-label="Shop by category"
            onClick={(event) => event.stopPropagation()}
          >
            <div className={styles.mobileDrawerHeader}>
              <span className={styles.mobileDrawerTitle}>Shop by category</span>
              <button
                type="button"
                className={styles.mobileCloseButton}
                aria-label="Close menu"
                onClick={onCloseMobile}
              >
                ✕
              </button>
            </div>

            <ul className={styles.mobileCategoryList}>
              {CATEGORIES.map((category, index) => {
                const hasSub = !category.noSub;
                const isExpanded = expandedMobileIndex === index;

                return (
                  <li key={category.label} className={styles.mobileCategoryItem}>
                    <div className={styles.mobileCategoryRow}>
                      <Link to={category.to} className={styles.mobileCategoryLink} onClick={onCloseMobile}>
                        {category.label}
                      </Link>
                      {hasSub && (
                        <button
                          type="button"
                          className={styles.mobileExpandButton}
                          aria-expanded={isExpanded}
                          aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${category.label} subcategories`}
                          onClick={() => toggleMobileCategory(index)}
                        >
                          {isExpanded ? '−' : '+'}
                        </button>
                      )}
                    </div>

                    {hasSub && isExpanded && (
                      <div className={styles.mobileSubList}>
                        {category.popular && (
                          <div className={styles.mobileSubGroup}>
                            <h4 className={styles.mobileSubHeading}>Most popular</h4>
                            <ul>
                              {category.popular.map((link) => (
                                <li key={link.label}>
                                  <Link to={link.to} className={styles.mobileSubLink} onClick={onCloseMobile}>
                                    {link.label}
                                  </Link>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {category.more && (
                          <div className={styles.mobileSubGroup}>
                            <h4 className={styles.mobileSubHeading}>More categories</h4>
                            <ul>
                              {category.more.map((link) => (
                                <li key={link.label}>
                                  <Link to={link.to} className={styles.mobileSubLink} onClick={onCloseMobile}>
                                    {link.label}
                                  </Link>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}
    </nav>
  );
}
