import { useState } from 'react';
import { Modal } from '@/components/common/Modal/Modal';
import { Button } from '@/components/common/Button/Button';
import { useCurrency } from '@/hooks/useCurrency';
import { formatMoney } from '@/utils/formatters';
import styles from './Footer.module.css';

/** Sample amount used to preview what the chosen market's prices look like. */
const PREVIEW_AMOUNT_UGX = 100_000;

/**
 * Market / display-currency switcher.
 *
 * Unlike the version this replaces — which wrote to a local useState and
 * changed nothing — choosing a market here dispatches to the currency slice,
 * persists to localStorage, and re-prices every component that reads
 * `useCurrency().format`.
 *
 * What it deliberately does NOT claim: it does not change the currency you are
 * charged in. Payments settle in UGX because MTN MoMo and Airtel Money are the
 * rails wired up, so the panel says so plainly rather than implying a
 * multi-currency checkout that does not exist.
 */
export function MarketSelector() {
  const { market, markets, displayCurrency, settlementCurrency, isConverted, ratesReady, ratesStale, convert, changeMarket } =
    useCurrency();
  const [isOpen, setIsOpen] = useState(false);

  const preview = convert(PREVIEW_AMOUNT_UGX);

  return (
    <>
      {/* A real button, not the <div onClick> this replaces — that one could
          not be reached by keyboard at all. */}
      <button
        type="button"
        className={styles.regionSelectorPill}
        onClick={() => setIsOpen(true)}
        aria-haspopup="dialog"
      >
        <span aria-hidden="true">{market.flag}</span>
        <span>{market.name}</span>
        <span className={styles.regionCurrency}>{displayCurrency}</span>
        <span className={styles.changeBtn}>Change</span>
      </button>

      {/* The shared Modal owns role="dialog", aria-modal, the labelled title,
          Escape-to-close, focus trapping and focus return. The footer no longer
          maintains its own dialog implementation. */}
      <Modal isOpen={isOpen} onClose={() => setIsOpen(false)} title="Choose your market">
        <p className={styles.modalIntro}>
          Prices across the site are shown in your market&rsquo;s currency.
        </p>

        <ul className={styles.countryGrid}>
          {markets.map((option) => {
            const isActive = option.code === market.code;
            return (
              <li key={option.code}>
                <button
                  type="button"
                  className={`${styles.countryOption} ${isActive ? styles.activeOption : ''}`}
                  onClick={() => changeMarket(option.code)}
                  aria-pressed={isActive}
                >
                  <span className={styles.countryFlag} aria-hidden="true">
                    {option.flag}
                  </span>
                  <span>
                    <strong>{option.name}</strong>
                    <span className={styles.countryCurrency}>{option.currency}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        {isConverted && (
          <p className={styles.modalNote}>
            {ratesReady && preview !== null ? (
              <>
                Example: {formatMoney(PREVIEW_AMOUNT_UGX, settlementCurrency)} is about{' '}
                {formatMoney(preview, displayCurrency)}.{' '}
              </>
            ) : null}
            Converted prices are indicative. Orders are charged in {settlementCurrency}, because
            that is the currency our payment providers settle in.
            {ratesStale && ' Exchange rates could not be refreshed recently.'}
          </p>
        )}

        <div className={styles.modalActions}>
          <Button onClick={() => setIsOpen(false)}>Done</Button>
        </div>
      </Modal>
    </>
  );
}
