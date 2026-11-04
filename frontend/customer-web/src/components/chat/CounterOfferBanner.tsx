import { useState, type FormEvent } from 'react';
import { Button } from '@/components/common/Button/Button';
import { formatMoney } from '@/utils/formatters';
import { classNames } from '@/utils/helpers';
import type { Offer, OfferParty } from '@/types/chat.types';
import styles from './CounterOfferBanner.module.css';

export interface CounterOfferBannerProps {
  offer: Offer;
  viewerRole: OfferParty;
  onAccept: (offerId: string) => void;
  onDecline: (offerId: string) => void;
  onCounter: (offerId: string, price: number) => void;
}

function timeLeftLabel(expiresAt: string): string {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return 'Expired';
  const hours = Math.floor(ms / (60 * 60 * 1000));
  const minutes = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));
  return hours > 0 ? `${hours}h ${minutes}m left` : `${minutes}m left`;
}

/** Renders one negotiation round inline in the chat thread — the newest pending round is actionable. */
export function CounterOfferBanner({ offer, viewerRole, onAccept, onDecline, onCounter }: CounterOfferBannerProps) {
  const [showCounterInput, setShowCounterInput] = useState(false);
  const [counterPrice, setCounterPrice] = useState('');

  const isMyTurn = offer.status === 'pending' && offer.proposedBy !== viewerRole;
  const isWaitingOnPeer = offer.status === 'pending' && offer.proposedBy === viewerRole;

  const handleCounterSubmit = (e: FormEvent) => {
    e.preventDefault();
    const value = Number(counterPrice);
    if (!value || value <= 0) return;
    onCounter(offer.id, value);
    setShowCounterInput(false);
    setCounterPrice('');
  };

  const proposerLabel = offer.proposedBy === 'buyer' ? 'Buyer' : 'Seller';

  return (
    <div className={classNames(styles.banner, styles[offer.status])}>
      <div className={styles.header}>
        <span className={styles.label}>
          {offer.round === 1 ? 'Offer' : `Counter-offer · round ${offer.round}`} from {proposerLabel}
        </span>
        {offer.status === 'pending' && <span className={styles.meta}>{timeLeftLabel(offer.expiresAt)}</span>}
      </div>

      <div className={styles.price}>{formatMoney(offer.offerPrice, offer.currency)}</div>

      {offer.status === 'accepted' && (
        <span className={classNames(styles.statusLine, styles.accepted)}>
          ✅ Accepted — discounted checkout unlocked
        </span>
      )}
      {offer.status === 'declined' && (
        <span className={classNames(styles.statusLine, styles.declined)}>Offer declined</span>
      )}
      {offer.status === 'expired' && (
        <span className={classNames(styles.statusLine, styles.expired)}>This offer expired</span>
      )}
      {offer.status === 'countered' && (
        <span className={classNames(styles.statusLine, styles.waiting)}>Superseded by a counter-offer below</span>
      )}
      {isWaitingOnPeer && (
        <span className={classNames(styles.statusLine, styles.waiting)}>
          Waiting for {proposerLabel === 'Buyer' ? 'seller' : 'buyer'} to respond…
        </span>
      )}

      {isMyTurn && !showCounterInput && (
        <div className={styles.actions}>
          <Button size="sm" variant="accent" onClick={() => onAccept(offer.id)}>
            Accept
          </Button>
          <Button size="sm" variant="outline" onClick={() => setShowCounterInput(true)}>
            Counter
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onDecline(offer.id)}>
            Decline
          </Button>
        </div>
      )}

      {isMyTurn && showCounterInput && (
        <form className={styles.counterRow} onSubmit={handleCounterSubmit}>
          <input
            className={styles.counterInput}
            type="number"
            inputMode="decimal"
            min={1}
            autoFocus
            placeholder={`Counter in ${offer.currency}`}
            value={counterPrice}
            onChange={(e) => setCounterPrice(e.target.value)}
          />
          <Button type="submit" size="sm" variant="accent">
            Send
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setShowCounterInput(false)}>
            Cancel
          </Button>
        </form>
      )}
    </div>
  );
}
