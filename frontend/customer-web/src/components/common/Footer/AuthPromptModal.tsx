import { useNavigate } from 'react-router-dom';
import { Modal } from '@/components/common/Modal/Modal';
import { Button } from '@/components/common/Button/Button';
import { ROUTES } from '@/router/routes';
import styles from './Footer.module.css';

export interface AuthPromptModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Where the shopper was trying to go, e.g. '/orders'. */
  destination: string | null;
  /** The link label they clicked, used to explain what they were reaching for. */
  destinationLabel: string | null;
}

/**
 * Shown when a signed-out visitor clicks a footer link whose destination sits
 * behind PrivateRoute.
 *
 * Previously the click navigated, PrivateRoute caught it, and the router threw
 * them to /login with no explanation of what had happened or why. Intercepting
 * at the footer means the reason is stated before anything moves.
 *
 * Sign-in carries the destination in `location.state.from` — the mechanism
 * PrivateRoute and LoginForm already share (LoginForm reads
 * `state.from.pathname` and returns there after login). A `?redirect=` query
 * parameter would be a second, competing convention and an open-redirect
 * surface as soon as anything read it back unvalidated.
 */
export function AuthPromptModal({
  isOpen,
  onClose,
  destination,
  destinationLabel,
}: AuthPromptModalProps) {
  const navigate = useNavigate();

  function goTo(path: string) {
    onClose();
    navigate(path, destination ? { state: { from: { pathname: destination } } } : undefined);
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Sign in to continue">
      <p className={styles.modalIntro}>
        {destinationLabel
          ? `${destinationLabel} is part of your MUNI account.`
          : 'That page is part of your MUNI account.'}{' '}
        Sign in and we&rsquo;ll take you straight there.
      </p>

      <div className={styles.modalActions}>
        <Button onClick={() => goTo(ROUTES.login)}>Sign in</Button>
        <Button variant="outline" onClick={() => goTo(ROUTES.register)}>
          Create an account
        </Button>
      </div>

      <p className={styles.modalNote}>
        Looking for help instead? Visit the{' '}
        <a href="/help" className={styles.newsletterConsentLink}>
          Help Center
        </a>{' '}
        — no account needed.
      </p>
    </Modal>
  );
}
