import { useId, useState, type CSSProperties, type FormEvent } from 'react';
import { Input } from '@/components/common/Input/Input';
import { Button } from '@/components/common/Button/Button';
import { Modal } from '@/components/common/Modal/Modal';
import { CVC_LENGTH, detectCardBrand, formatCardNumber, formatExpiry, isFutureExpiry, isValidLuhn } from '@/utils/card';
import type { CardBrand } from '@/types/order.types';

export interface TokenizedCard {
  cardToken: string;
  last4: string;
  brand: CardBrand;
  expiryMonth: string;
  expiryYear: string;
}

export interface VisaCardFormProps {
  /**
   * Sends the raw card fields directly to the PCI-DSS-compliant card
   * gateway's client-side tokenization SDK and resolves with the token it
   * returns. The raw PAN/CVC never reach our backend — only `cardToken`
   * plus non-sensitive last4/brand/expiry are forwarded to `onSubmit`. Wire
   * this to the real gateway SDK (e.g. `window.CardGateway.tokenize(...)`)
   * at the call site.
   */
  tokenizeCard: (fields: {
    cardNumber: string;
    expiryMonth: string;
    expiryYear: string;
    cvc: string;
    cardholderName: string;
  }) => Promise<{ cardToken: string }>;
  onSubmit: (card: TokenizedCard) => void | Promise<void>;
  /** Set once payment-service responds with a 3DS2 challenge for this charge. */
  threeDSecureRedirectUrl?: string | null;
  /** Called if the customer cancels the 3DS challenge instead of completing it. */
  onCancelThreeDSecure?: () => void;
  isSubmitting?: boolean;
}

export function VisaCardForm({
  tokenizeCard,
  onSubmit,
  threeDSecureRedirectUrl,
  onCancelThreeDSecure,
  isSubmitting,
}: VisaCardFormProps) {
  const [cardholderName, setCardholderName] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvc, setCvc] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isTokenizing, setIsTokenizing] = useState(false);
  const legendId = useId();

  const brand = detectCardBrand(cardNumber);

  function validate(): boolean {
    const next: Record<string, string> = {};

    if (!cardholderName.trim()) {
      next.cardholderName = 'Enter the name on the card';
    }

    const digits = cardNumber.replace(/\D/g, '');
    if (!digits) {
      next.cardNumber = 'Card number is required';
    } else if (!brand) {
      next.cardNumber = 'We only accept Visa and Mastercard';
    } else if (!isValidLuhn(digits)) {
      next.cardNumber = 'Enter a valid card number';
    }

    const [month, year] = expiry.split('/');
    if (!month || !year || month.length !== 2 || year.length !== 2) {
      next.expiry = 'Enter the expiry as MM/YY';
    } else if (!isFutureExpiry(month, year)) {
      next.expiry = 'This card has expired';
    }

    if (!new RegExp(`^\\d{${CVC_LENGTH}}$`).test(cvc)) {
      next.cvc = `Enter the ${CVC_LENGTH}-digit security code`;
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!validate()) return;

    const digits = cardNumber.replace(/\D/g, '');
    const [month, rawYear] = expiry.split('/');
    const expiryYear = `20${rawYear}`;

    setIsTokenizing(true);
    setErrors((prev) => ({ ...prev, form: '' }));
    try {
      const { cardToken } = await tokenizeCard({
        cardNumber: digits,
        expiryMonth: month,
        expiryYear,
        cvc,
        cardholderName: cardholderName.trim(),
      });

      await onSubmit({
        cardToken,
        last4: digits.slice(-4),
        brand: brand as CardBrand,
        expiryMonth: month,
        expiryYear,
      });
    } catch (err) {
      setErrors((prev) => ({
        ...prev,
        form: err instanceof Error ? err.message : 'We could not process your card — check your details and try again',
      }));
    } finally {
      setIsTokenizing(false);
    }
  }

  const busy = isTokenizing || Boolean(isSubmitting);

  return (
    <>
      <form
        onSubmit={handleSubmit}
        style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}
        aria-labelledby={legendId}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <p id={legendId} style={{ fontWeight: 700 }}>
            Pay with Visa or Mastercard
          </p>
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <BrandIcon brand="VISA" active={brand === 'VISA'} />
            <BrandIcon brand="MASTERCARD" active={brand === 'MASTERCARD'} />
          </div>
        </div>

        <Input
          label="Cardholder name"
          autoComplete="cc-name"
          value={cardholderName}
          onChange={(event) => setCardholderName(event.target.value)}
          error={errors.cardholderName}
          required
        />

        <Input
          label="Card number"
          inputMode="numeric"
          autoComplete="cc-number"
          placeholder="4242 4242 4242 4242"
          value={cardNumber}
          onChange={(event) => setCardNumber(formatCardNumber(event.target.value))}
          error={errors.cardNumber}
          aria-describedby={brand ? `${legendId}-brand` : undefined}
          required
        />
        {brand && (
          <span id={`${legendId}-brand`} className="sr-only" style={visuallyHidden}>
            Detected card brand: {brand === 'VISA' ? 'Visa' : 'Mastercard'}
          </span>
        )}

        <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
          <div style={{ flex: 1 }}>
            <Input
              label="Expiry"
              inputMode="numeric"
              autoComplete="cc-exp"
              placeholder="MM/YY"
              value={expiry}
              onChange={(event) => setExpiry(formatExpiry(event.target.value))}
              error={errors.expiry}
              required
            />
          </div>
          <div style={{ flex: 1 }}>
            <Input
              label="CVC"
              inputMode="numeric"
              autoComplete="cc-csc"
              placeholder="•••"
              type="password"
              value={cvc}
              onChange={(event) => setCvc(event.target.value.replace(/\D/g, '').slice(0, CVC_LENGTH))}
              error={errors.cvc}
              required
            />
          </div>
        </div>

        {errors.form && (
          <p role="alert" style={{ color: 'var(--color-terracotta-dark)', fontSize: 'var(--text-sm)', fontWeight: 500 }}>
            {errors.form}
          </p>
        )}

        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
          Your card details are encrypted and tokenized in your browser — MUNI never sees or stores your full card number.
        </p>

        <Button type="submit" size="lg" fullWidth isLoading={busy}>
          Pay securely
        </Button>
      </form>

      <Modal
        isOpen={Boolean(threeDSecureRedirectUrl)}
        onClose={() => onCancelThreeDSecure?.()}
        title="Verify your card"
      >
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-3)' }}>
          Your bank requires additional verification (3-D Secure) to complete this payment. Follow the steps below —
          this window will close automatically once you're done.
        </p>
        {threeDSecureRedirectUrl && (
          <iframe
            src={threeDSecureRedirectUrl}
            title="3-D Secure card verification"
            sandbox="allow-forms allow-scripts allow-same-origin allow-top-navigation"
            style={{ width: '100%', height: 440, border: 'none', borderRadius: 'var(--radius-md)' }}
          />
        )}
      </Modal>
    </>
  );
}

const visuallyHidden: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  whiteSpace: 'nowrap',
  border: 0,
};

function BrandIcon({ brand, active }: { brand: CardBrand; active: boolean }) {
  const label = brand === 'VISA' ? 'Visa' : 'Mastercard';
  return (
    <span
      role="img"
      aria-label={`${label}${active ? ' (detected)' : ''}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2px 8px',
        borderRadius: 'var(--radius-sm)',
        fontSize: 'var(--text-xs)',
        fontWeight: 800,
        letterSpacing: '0.02em',
        border: active ? '1.5px solid transparent' : '1.5px solid var(--color-border)',
        opacity: active ? 1 : 0.35,
        color: brand === 'VISA' ? '#1a1f71' : '#eb001b',
        background: brand === 'VISA' ? '#f0f1fb' : '#fff2f2',
        transition: 'opacity var(--duration-base) var(--ease-standard)',
      }}
    >
      {brand === 'VISA' ? 'VISA' : 'Mastercard'}
    </span>
  );
}
