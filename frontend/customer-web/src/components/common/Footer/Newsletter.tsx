import { useId, useState, type FormEvent } from 'react';
import { newsletterApi } from '@/api/newsletter.api';
import { useCurrency } from '@/hooks/useCurrency';
import { isValidEmail } from '@/utils/validators';
import { ApiError } from '@/types/api.types';
import { logger } from '@/utils/logger';
import styles from './Footer.module.css';

type Status = 'idle' | 'submitting' | 'success' | 'error';

/**
 * Newsletter signup.
 *
 * This is a real subscription: the address is POSTed to newsletter-service,
 * stored with its consent evidence, and can be unsubscribed. The success
 * message is shown only after the request resolves — never optimistically —
 * and a failed request says so instead of claiming success.
 *
 * Validation runs on both sides. `isValidEmail` here is the same helper the
 * auth forms use; the server re-validates with Zod and owns the final answer,
 * because a client check is a convenience, not a control.
 */
export function Newsletter() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [message, setMessage] = useState('');
  const { market } = useCurrency();

  const inputId = useId();
  const feedbackId = useId();

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (status === 'submitting') return;

    const trimmed = email.trim();

    if (!isValidEmail(trimmed)) {
      setStatus('error');
      setMessage('Enter a valid email address.');
      return;
    }

    setStatus('submitting');
    setMessage('');

    try {
      const result = await newsletterApi.subscribe({ email: trimmed, market: market.code });
      setStatus('success');
      // The service decides the wording — it knows whether this deployment
      // requires a confirmation click.
      setMessage(result.message);
      setEmail('');
    } catch (error) {
      logger.warn('newsletter subscribe failed', error);
      setStatus('error');
      // ApiError messages are already normalised by axios.config (5xx bodies
      // are replaced with a generic line), so they are safe to show. Anything
      // else is replaced here rather than risking internal text on the page.
      setMessage(
        error instanceof ApiError && error.message
          ? error.message
          : 'Could not subscribe right now. Please try again.',
      );
    }
  }

  const isError = status === 'error';
  const isSuccess = status === 'success';

  return (
    <div className={styles.newsletterContent}>
      <div className={styles.newsletterText}>
        <h3>Join the Muni Shopping Club</h3>
        <p>Get new arrivals, price drops and weekly deals by email.</p>
      </div>

      <form className={styles.newsletterForm} onSubmit={handleSubmit} noValidate>
        {/* A real label, visually hidden. The previous input had a placeholder
            only, which is not an accessible name. */}
        <label className="visually-hidden" htmlFor={inputId}>
          Email address for the MUNI newsletter
        </label>
        <input
          id={inputId}
          type="email"
          className={styles.emailInput}
          placeholder="Enter your email address"
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
            if (status !== 'idle') setStatus('idle');
          }}
          autoComplete="email"
          disabled={status === 'submitting'}
          aria-invalid={isError || undefined}
          aria-describedby={message ? feedbackId : undefined}
        />
        <button type="submit" className={styles.subscribeBtn} disabled={status === 'submitting'}>
          {status === 'submitting' ? 'Subscribing…' : 'Subscribe'}
        </button>
      </form>

      {/* Consent copy. `consentVersion` on the stored row identifies this
          wording, so a later change is distinguishable in the record. */}
      <p className={styles.newsletterConsent}>
        You can unsubscribe at any time. See our{' '}
        <a href="/privacy" className={styles.newsletterConsentLink}>
          Privacy Notice
        </a>
        .
      </p>

      {message && (
        <div
          id={feedbackId}
          className={isError ? styles.toastError : styles.toastSuccess}
          // assertive for an error the user must correct; polite for success.
          role={isError ? 'alert' : 'status'}
        >
          {isSuccess ? '✓ ' : ''}
          {message}
        </div>
      )}
    </div>
  );
}
