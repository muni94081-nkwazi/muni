import { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useMediaQuery, MOBILE_QUERY } from '@/hooks/useMediaQuery';
import { AppDownload } from './AppDownload';
import { AuthPromptModal } from './AuthPromptModal';
import { FooterCategories } from './FooterCategories';
import { FooterColumn } from './FooterColumn';
import { MarketSelector } from './MarketSelector';
import { Newsletter } from './Newsletter';
import { SocialLinks } from './SocialLinks';
import { FOOTER_COLUMNS, LEGAL_LINKS, PAYMENT_METHODS, type FooterLink } from './footer.config';
import styles from './Footer.module.css';

const TRUST_SIGNALS = [
  {
    id: 'protection',
    icon: '🛡️',
    title: 'Buyer Protection',
    detail: 'How claims are handled',
    href: '/buyer-protection',
  },
  {
    id: 'delivery',
    icon: '🚚',
    title: 'Nationwide Delivery',
    detail: 'Rates and timelines',
    href: '/shipping-policy',
  },
  {
    id: 'payments',
    icon: '🔒',
    title: 'Mobile Money & Card',
    detail: 'Accepted payment methods',
    href: '/cod',
  },
];

export function Footer() {
  const { isAuthenticated, isAdmin } = useAuth();
  const isMobile = useMediaQuery(MOBILE_QUERY);

  const [openColumns, setOpenColumns] = useState<Record<string, boolean>>({});
  const [authPrompt, setAuthPrompt] = useState<FooterLink | null>(null);

  const columns = useMemo(
    () =>
      FOOTER_COLUMNS.map((column) => ({
        ...column,
        links: column.links.filter((link) => !link.adminOnly || isAdmin),
      })).filter((column) => column.links.length > 0),
    [isAdmin],
  );

  const toggleColumn = useCallback((id: string) => {
    setOpenColumns((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const scrollToTop = useCallback(() => {
    // Honour the OS reduced-motion setting — a long animated scroll is a
    // vestibular trigger, and this one used to be unconditional.
    const reduced =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
  }, []);

  return (
    <footer className={styles.footerContainer}>
      {/* One h2 for the whole footer, so every heading inside it is a
          well-formed h3 rather than a jump from the page's h1. */}
      <h2 className="visually-hidden">MUNI site footer</h2>

      <button type="button" className={styles.backToTop} onClick={scrollToTop}>
        <span>Back to top ↑</span>
      </button>

      <div className={styles.newsletterBanner}>
        <Newsletter />
        {/* Renders null until a real store URL is configured. */}
        <AppDownload />
      </div>

      <div className={styles.trustBar}>
        <div className={styles.trustInner}>
          <ul className={styles.trustList}>
            {TRUST_SIGNALS.map((signal) => (
              <li key={signal.id} className={styles.trustItem}>
                <span className={styles.trustIcon} aria-hidden="true">
                  {signal.icon}
                </span>
                <Link to={signal.href} className={styles.trustLink}>
                  <strong>{signal.title}</strong>
                  <small>{signal.detail}</small>
                </Link>
              </li>
            ))}
          </ul>
          <div className={styles.trustPaymentPills}>
            <h3 className="visually-hidden">Accepted payment methods</h3>
            <ul className={styles.paymentList}>
              {Object.values(PAYMENT_METHODS).map((method) => (
                <li key={method} className={styles.paymentPill}>
                  {method}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <nav className={styles.mainFooter} aria-label="Footer">
        <div className={styles.columnsGrid}>
          {columns.map((column) => (
            <FooterColumn
              key={column.id}
              column={column}
              isCollapsible={isMobile}
              isOpen={Boolean(openColumns[column.id])}
              onToggle={() => toggleColumn(column.id)}
              onProtectedLink={setAuthPrompt}
              isAuthenticated={isAuthenticated}
            />
          ))}
        </div>

        {/* Fetched from product-service; renders null when unavailable. */}
        <FooterCategories />

        <div className={styles.logoBar}>
          <Link to="/" className={styles.footerLogo}>
            Muni<span className={styles.logoDot}>.ug</span>
          </Link>
          <MarketSelector />
        </div>
      </nav>

      <div className={styles.bottomBar}>
        {/* Renders null until a real profile URL is configured. */}
        <SocialLinks />

        <nav className={styles.legalLinks} aria-label="Legal">
          <ul className={styles.legalList}>
            {LEGAL_LINKS.map((link) => (
              <li key={link.href}>
                <Link to={link.href}>{link.label}</Link>
              </li>
            ))}
          </ul>
        </nav>

        <p className={styles.copyrightText}>
          © 2024-{new Date().getFullYear()} Muni.ug. All rights reserved.
        </p>
      </div>

      <AuthPromptModal
        isOpen={authPrompt !== null}
        onClose={() => setAuthPrompt(null)}
        destination={authPrompt?.href ?? null}
        destinationLabel={authPrompt?.label ?? null}
      />
    </footer>
  );
}
