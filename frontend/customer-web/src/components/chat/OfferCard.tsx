import { useState, type FormEvent } from 'react';
import { Button } from '@/components/common/Button/Button';
import { formatMoney } from '@/utils/formatters';
import { MAX_OFFERS_PER_PRODUCT } from '@/types/chat.types';
import styles from './OfferCard.module.css';

export interface OfferCardProps {
  originalPrice: number;
  currency: string;
  offersUsed: number;
  onSubmit: (offerPrice: number) => void;
  disabled?: boolean;
}

/** "Make an Offer" creation card — a buyer proposes a price below the listed one. */
export function OfferCard({ originalPrice, currency, offersUsed, onSubmit, disabled }: OfferCardProps) {
  const [price, setPrice] = useState('');
  const [error, setError] = useState<string | null>(null);

  const offersRemaining = Math.max(0, MAX_OFFERS_PER_PRODUCT - offersUsed);
  const limitReached = offersRemaining === 0;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const value = Number(price);

    if (!value || value <= 0) {
      setError('Enter an offer amount');
      return;
    }
    if (value >= originalPrice) {
      setError(`Your offer must be below ${formatMoney(originalPrice, currency)}`);
      return;
    }

    setError(null);
    onSubmit(value);
    setPrice('');
  };

  if (limitReached) {
    return (
      <div className={styles.card}>
        <p className={styles.limitNotice}>
          You've used all {MAX_OFFERS_PER_PRODUCT} offers allowed for this item.
        </p>
      </div>
    );
  }

  return (
    <form className={styles.card} onSubmit={handleSubmit}>
      <div>
        <div className={styles.title}>Make an Offer</div>
        <div className={styles.subtitle}>
          Listed at {formatMoney(originalPrice, currency)} · {offersRemaining} offer
          {offersRemaining === 1 ? '' : 's'} left · expires in 24h
        </div>
      </div>

      <div className={styles.row}>
        <span className={styles.currencyPrefix}>{currency}</span>
        <input
          className={styles.input}
          type="number"
          inputMode="decimal"
          min={1}
          placeholder="Your price"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          disabled={disabled}
        />
        <Button type="submit" size="sm" variant="accent" disabled={disabled}>
          Send Offer
        </Button>
      </div>

      {error && <span className={styles.error}>{error}</span>}
    </form>
  );
}
