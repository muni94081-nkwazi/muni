import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  renderWithProviders,
  signedIn,
  signedOut,
  stubMatchMedia,
  withCurrency,
} from '@/test-utils/renderWithProviders';

// The footer fetches categories and rates on mount. Stubbed so these tests
// assert footer behaviour rather than network timing.
vi.mock('@/api/products.api', () => ({
  productsApi: { getCategories: vi.fn().mockResolvedValue([]) },
}));
vi.mock('@/api/currencies.api', () => ({
  currenciesApi: { rates: vi.fn().mockResolvedValue({ baseCurrency: 'USD', rates: {}, stale: false }) },
}));
vi.mock('@/api/newsletter.api', () => ({
  newsletterApi: { subscribe: vi.fn() },
}));

import { Footer } from '../Footer';

const DESKTOP = () => stubMatchMedia(() => false);
const MOBILE = () => stubMatchMedia((q) => q.includes('max-width: 768px'));

function renderFooter(state = signedOut()) {
  return renderWithProviders(<Footer />, { preloadedState: { ...state, ...withCurrency() } });
}

beforeEach(() => {
  vi.clearAllMocks();
  DESKTOP();
});

describe('Footer — rendering', () => {
  it('renders as a contentinfo landmark with a footer nav', () => {
    renderFooter();
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Footer' })).toBeInTheDocument();
  });

  it('renders every column with its links', () => {
    renderFooter();
    for (const title of [
      'Get to Know Us',
      'Make Money with Us',
      'Payment & Financing',
      'Let Us Help You',
      'Muni Services',
    ]) {
      expect(screen.getByRole('heading', { name: title })).toBeInTheDocument();
    }
    expect(screen.getByRole('link', { name: 'About Muni Group' })).toHaveAttribute('href', '/about');
  });

  it('exposes one h2 and an h3 per column', () => {
    renderFooter();
    const footer = screen.getByRole('contentinfo');
    expect(within(footer).getAllByRole('heading', { level: 2 })).toHaveLength(1);
    expect(within(footer).getAllByRole('heading', { level: 3 }).length).toBeGreaterThanOrEqual(5);
  });

  it('renders the sibling seller app as a plain anchor, not a router link', () => {
    renderFooter();
    expect(screen.getByRole('link', { name: 'Seller Center Portal' })).toHaveAttribute(
      'href',
      '/seller/',
    );
  });

  it('hides the admin link from a shopper and shows it to an admin', () => {
    renderFooter();
    expect(screen.queryByRole('link', { name: 'Admin Panel' })).not.toBeInTheDocument();

    renderFooter(signedIn(['ROLE_ADMIN']));
    expect(screen.getByRole('link', { name: 'Admin Panel' })).toHaveAttribute('href', '/admin/');
  });

  it('uses real anchors with hrefs throughout, never click-only navigation', () => {
    renderFooter();
    const footer = screen.getByRole('contentinfo');
    for (const anchor of Array.from(footer.querySelectorAll('a'))) {
      expect(anchor).toHaveAttribute('href');
      expect(anchor.textContent?.trim()).toBeTruthy();
    }
  });
});

describe('Footer — no placeholder content', () => {
  it('renders no placeholder social links', () => {
    renderFooter();
    for (const host of ['facebook.com', 'twitter.com', 'instagram.com', 'linkedin.com', 'wa.me']) {
      expect(document.querySelector(`a[href*="${host}"]`)).toBeNull();
    }
  });

  it('renders no app-store links or QR mock while the app is unpublished', () => {
    renderFooter();
    expect(screen.queryByText(/qr code mock/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /app store/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /google play/i })).not.toBeInTheDocument();
  });

  it('renders a real newsletter form rather than a fake success', () => {
    renderFooter();
    expect(screen.getByLabelText(/email address for the muni newsletter/i)).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});

describe('Footer — auth-aware links', () => {
  it('opens the sign-in prompt instead of navigating a signed-out visitor', async () => {
    const user = userEvent.setup();
    renderFooter(signedOut());

    await user.click(screen.getByRole('link', { name: 'Track Your Orders' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: /sign in to continue/i })).toBeInTheDocument();
    expect(within(dialog).getByText(/track your orders is part of your muni account/i)).toBeInTheDocument();
  });

  it('keeps a real href on the protected link so it stays crawlable', () => {
    renderFooter(signedOut());
    expect(screen.getByRole('link', { name: 'Track Your Orders' })).toHaveAttribute('href', '/orders');
  });

  it('lets a signed-in shopper through without a prompt', async () => {
    const user = userEvent.setup();
    renderFooter(signedIn());

    await user.click(screen.getByRole('link', { name: 'Track Your Orders' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('does not hide support links from signed-out visitors', () => {
    renderFooter(signedOut());
    expect(screen.getByRole('link', { name: /help & live support/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /returns & refund center/i })).toBeInTheDocument();
  });

  it('closes the prompt on Escape and returns focus to the link', async () => {
    const user = userEvent.setup();
    renderFooter(signedOut());

    const link = screen.getByRole('link', { name: 'Track Your Orders' });
    await user.click(link);
    await screen.findByRole('dialog');

    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(link).toHaveFocus();
  });
});

describe('Footer — market selector', () => {
  it('is a real button, reachable by keyboard', () => {
    renderFooter();
    const pill = screen.getByRole('button', { name: /uganda/i });
    expect(pill).toBeInTheDocument();
    pill.focus();
    expect(pill).toHaveFocus();
  });

  it('opens an accessible dialog listing the configured markets', async () => {
    const user = userEvent.setup();
    renderFooter();

    await user.click(screen.getByRole('button', { name: /uganda/i }));

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(within(dialog).getByRole('heading', { name: /choose your market/i })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /kenya/i })).toBeInTheDocument();
  });

  it('changes the display currency in the store when a market is chosen', async () => {
    const user = userEvent.setup();
    const { store } = renderFooter();

    await user.click(screen.getByRole('button', { name: /uganda/i }));
    await user.click(await screen.findByRole('button', { name: /kenya/i }));

    const state = store.getState() as { currency: { marketCode: string; displayCurrency: string } };
    expect(state.currency.marketCode).toBe('KE');
    expect(state.currency.displayCurrency).toBe('KES');
  });

  it('persists the chosen market to localStorage so it survives a reload', async () => {
    const user = userEvent.setup();
    renderFooter();

    await user.click(screen.getByRole('button', { name: /uganda/i }));
    await user.click(await screen.findByRole('button', { name: /kenya/i }));

    expect(window.localStorage.getItem('muni_market')).toBe('KE');
  });

  it('states that orders are still charged in the settlement currency', async () => {
    const user = userEvent.setup();
    renderFooter();

    await user.click(screen.getByRole('button', { name: /uganda/i }));
    await user.click(await screen.findByRole('button', { name: /kenya/i }));

    expect(await screen.findByText(/charged in UGX/i)).toBeInTheDocument();
  });
});

describe('Footer — desktop layout', () => {
  it('shows links permanently and announces no accordion state', () => {
    renderFooter();
    expect(screen.queryByRole('button', { name: /Get to Know Us/ })).not.toBeInTheDocument();
    expect(document.querySelector('[aria-expanded]')).toBeNull();
    expect(screen.getByRole('link', { name: 'About Muni Group' })).toBeVisible();
  });
});

describe('Footer — mobile accordion', () => {
  beforeEach(MOBILE);

  it('collapses each column behind a toggle that reports its state', async () => {
    const user = userEvent.setup();
    renderFooter();

    const toggle = screen.getByRole('button', { name: /Get to Know Us/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');

    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  it('wires aria-controls to the list the toggle actually controls', async () => {
    const user = userEvent.setup();
    renderFooter();

    const toggle = screen.getByRole('button', { name: /Make Money with Us/ });
    const id = toggle.getAttribute('aria-controls');
    expect(id).toBeTruthy();

    await user.click(toggle);
    const panel = document.getElementById(id as string);
    expect(panel).not.toBeNull();
    expect(within(panel as HTMLElement).getByRole('link', { name: 'Sell on Muni Market' })).toBeInTheDocument();
  });

  it('applies the open class only to the expanded column', async () => {
    const user = userEvent.setup();
    renderFooter();

    const toggle = screen.getByRole('button', { name: /Muni Services/ });
    const panel = document.getElementById(toggle.getAttribute('aria-controls') as string);

    // Collapse is driven by max-height + visibility via this class, not by the
    // display flip the old stylesheet attempted (which never worked).
    expect(panel?.className).not.toMatch(/columnLinksOpen/);
    await user.click(toggle);
    expect(panel?.className).toMatch(/columnLinksOpen/);
  });

  it('opens a column from the keyboard', async () => {
    const user = userEvent.setup();
    renderFooter();

    const toggle = screen.getByRole('button', { name: /Let Us Help You/ });
    toggle.focus();
    await user.keyboard('{Enter}');
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
  });

  it('opens each column independently', async () => {
    const user = userEvent.setup();
    renderFooter();

    await user.click(screen.getByRole('button', { name: /Muni Services/ }));
    expect(screen.getByRole('button', { name: /Muni Services/ })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: /Get to Know Us/ })).toHaveAttribute('aria-expanded', 'false');
  });
});
