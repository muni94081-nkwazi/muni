import type { LegalDocumentContent } from '@legal';
import { PageHeader } from '@/components/common/PageHeader';
import styles from './LegalDocument.module.css';

/**
 * Renders a shared legal document from frontend/shared/legal.
 *
 * The mobile app has its own renderer for the same content (see
 * mobile/src/components/LegalDocument.tsx). Only presentation differs — the
 * wording is identical on both platforms because it comes from one module.
 *
 * Sections are numbered here rather than in the content, so the documents stay
 * free of presentation and can be re-ordered without renumbering by hand.
 */

interface LegalDocumentProps {
  content: LegalDocumentContent;
  /** Emoji shown in the page header, matching the neighbouring footer pages. */
  icon: string;
  /** Breadcrumb label. Defaults to the document title. */
  breadcrumbLabel?: string;
}

export function LegalDocument({ content, icon, breadcrumbLabel }: LegalDocumentProps) {
  const { title, effective, intro, sections, footer } = content;

  return (
    <div className="container" style={{ padding: '24px 16px 48px' }}>
      {/* No `subtitle` here on purpose: the intro is rendered once, in the card
          below. Passing it to the header as well printed the same paragraph
          twice on the page. */}
      <PageHeader title={title} icon={icon} breadcrumbs={[{ label: breadcrumbLabel ?? title }]} />

      <article className={styles.sheet}>
        <p className={styles.effective}>{effective}</p>
        <p className={styles.intro}>{intro}</p>

        {sections.map((section, index) => (
          <section key={section.heading} className={styles.section}>
            <h2 className={styles.heading}>
              {index + 1}. {section.heading}
            </h2>

            {section.body.map((paragraph, i) => (
              <p key={i} className={styles.paragraph}>
                {paragraph}
              </p>
            ))}

            {section.bullets ? (
              <ul className={styles.bullets}>
                {section.bullets.map((bullet) => (
                  <li key={bullet} className={styles.bullet}>
                    {bullet}
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        ))}

        {footer ? <p className={styles.footerNote}>{footer}</p> : null}
      </article>
    </div>
  );
}
