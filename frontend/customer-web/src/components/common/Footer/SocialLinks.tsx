import { SOCIAL_LINKS, type SocialLink } from './footer.config';
import styles from './Footer.module.css';

export interface SocialLinksProps {
  links?: SocialLink[];
}

/**
 * Configured social channels, and nothing at all when none are configured —
 * which is the current state, because no verified MUNI accounts exist.
 *
 * A link to a network's own homepage looks official and goes nowhere useful,
 * so it is worse than an absent section. footer.links.test.ts rejects bare
 * homepage URLs to stop one being reintroduced.
 */
export function SocialLinks({ links = SOCIAL_LINKS }: SocialLinksProps) {
  if (links.length === 0) return null;

  return (
    <nav className={styles.socialLinks} aria-label="MUNI on social media">
      <span className={styles.socialLabel}>Follow us:</span>
      <ul className={styles.socialList}>
        {links.map((link) => (
          <li key={link.id}>
            <a
              className={styles.socialIcon}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              {/* Real text, never an icon standing in for the accessible name. */}
              {link.label}
              <span className="visually-hidden"> (opens in a new tab)</span>
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
