import { APP_LINKS, APP_QR_TARGET, type AppLink } from './footer.config';
import { QrCode } from './QrCode';
import styles from './Footer.module.css';

export interface AppDownloadProps {
  links?: AppLink[];
  qrTarget?: string | null;
}

const PLATFORM_NAME: Record<AppLink['platform'], string> = {
  ios: 'iOS',
  android: 'Android',
};

/**
 * Store links for the mobile app, plus a scannable QR code.
 *
 * Renders nothing while APP_LINKS is empty, which is the current state: the
 * app in mobile/ is not published and no store URL exists in the repository.
 * The three buttons this replaces opened a modal reading "QR CODE MOCK".
 *
 * The QR code appears only when a real `qrTarget` is configured, so it can
 * never encode a dead link. Add a URL to footer.config.ts and both the links
 * and the code start working — no other change needed.
 */
export function AppDownload({ links = APP_LINKS, qrTarget = APP_QR_TARGET }: AppDownloadProps) {
  if (links.length === 0) return null;

  return (
    <div className={styles.appDownloadSection}>
      <div className={styles.appText}>
        <h3>Get the MUNI app</h3>
        <p>Shop and track orders from your phone.</p>
      </div>

      <div className={styles.appBadges}>
        <ul className={styles.appList}>
          {links.map((link) => (
            <li key={link.id}>
              <a
                className={styles.appBadge}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                {link.label}
                <span className="visually-hidden">
                  {` for ${PLATFORM_NAME[link.platform]} (opens in a new tab)`}
                </span>
              </a>
            </li>
          ))}
        </ul>

        {qrTarget && (
          <div className={styles.qrBox}>
            <QrCode value={qrTarget} size={110} label={`QR code linking to ${qrTarget}`} />
            <span className={styles.qrCaption}>Scan to download</span>
          </div>
        )}
      </div>
    </div>
  );
}
