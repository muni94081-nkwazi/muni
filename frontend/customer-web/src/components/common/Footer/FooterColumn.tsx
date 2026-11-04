import { useId } from 'react';
import { Link } from 'react-router-dom';
import type { FooterColumn as FooterColumnData, FooterLink } from './footer.config';
import styles from './Footer.module.css';

export interface FooterColumnProps {
  column: FooterColumnData;
  /** True only on the mobile layout, where the column collapses behind a toggle. */
  isCollapsible: boolean;
  isOpen: boolean;
  onToggle: () => void;
  /** Called instead of navigating when a signed-out visitor clicks a protected link. */
  onProtectedLink: (link: FooterLink) => void;
  isAuthenticated: boolean;
}

export function FooterColumn({
  column,
  isCollapsible,
  isOpen,
  onToggle,
  onProtectedLink,
  isAuthenticated,
}: FooterColumnProps) {
  const headingId = useId();
  const listId = useId();

  // Expanded whenever the layout is not collapsible. On desktop the heading is
  // a plain heading, not a control — emitting aria-expanded there (as the
  // previous footer did at every width) announces a collapsed state for links
  // that are plainly visible.
  const expanded = !isCollapsible || isOpen;

  function renderLink(link: FooterLink) {
    const needsPrompt = link.requiresAuth && !isAuthenticated;

    // External links leave this SPA for a sibling app served by nginx
    // (seller-center, admin-panel). They need a real navigation: a <Link>
    // would try to resolve /seller/ inside this bundle and hit NotFoundPage.
    if (link.external) {
      return (
        <a key={link.label} href={link.href} className={styles.linkItem}>
          {link.label}
          {link.badge && <span className={styles.linkBadge}>{link.badge}</span>}
        </a>
      );
    }

    // Still a real anchor with a real href — so it is crawlable, middle-
    // clickable and shown in the status bar. Only the plain left-click is
    // intercepted, to explain the sign-in before the router bounces them.
    return (
      <Link
        key={link.label}
        to={link.href}
        className={styles.linkItem}
        onClick={(event) => {
          if (!needsPrompt) return;
          // Let modified clicks (new tab/window) through untouched.
          if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
          event.preventDefault();
          onProtectedLink(link);
        }}
      >
        {link.label}
        {link.badge && <span className={styles.linkBadge}>{link.badge}</span>}
      </Link>
    );
  }

  return (
    <div className={styles.columnWrapper}>
      <h3 className={styles.columnHeading} id={headingId}>
        {isCollapsible ? (
          <button
            type="button"
            className={styles.accordionHeader}
            onClick={onToggle}
            aria-expanded={isOpen}
            aria-controls={listId}
          >
            <span>{column.title}</span>
            <span className={styles.accordionChevron} aria-hidden="true">
              {isOpen ? '−' : '+'}
            </span>
          </button>
        ) : (
          <span className={styles.columnTitle}>{column.title}</span>
        )}
      </h3>

      {/*
        Collapse is driven by max-height so the open/close animates, rather than
        the display:none/flex flip the old stylesheet attempted — that one never
        worked at all, because an unconditional `.columnLinks { display: flex }`
        sat AFTER the media query and won on source order, so mobile sections
        never actually collapsed.

        The collapsed state also sets `visibility: hidden` (see the stylesheet),
        which is what actually takes the links out of the tab order and the
        accessibility tree — max-height alone would not, since a zero-height
        overflow-hidden box still holds focusable anchors. `visibility` is used
        rather than `display` precisely because it animates.
      */}
      <div
        id={listId}
        className={`${styles.columnLinks} ${expanded ? styles.columnLinksOpen : ''}`}
        aria-labelledby={headingId}
      >
        <ul className={styles.linkList}>
          {column.links.map((link) => (
            <li key={link.label}>{renderLink(link)}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
