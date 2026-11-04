import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders, signedOut, withCurrency } from '@/test-utils/renderWithProviders';
import { ApiError } from '@/types/api.types';

vi.mock('@/api/newsletter.api', () => ({
  newsletterApi: { subscribe: vi.fn() },
}));

import { newsletterApi } from '@/api/newsletter.api';
import { Newsletter } from '../Newsletter';

const mocked = vi.mocked(newsletterApi);

function renderNewsletter() {
  return renderWithProviders(<Newsletter />, {
    preloadedState: { ...signedOut(), ...withCurrency() },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Newsletter — validation', () => {
  it('has an accessible label, not just a placeholder', () => {
    renderNewsletter();
    expect(screen.getByLabelText(/email address for the muni newsletter/i)).toBeInTheDocument();
  });

  it('rejects an invalid email client-side without calling the API', async () => {
    const user = userEvent.setup();
    renderNewsletter();

    await user.type(screen.getByLabelText(/email address/i), 'not-an-email');
    await user.click(screen.getByRole('button', { name: /subscribe/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Enter a valid email address.');
    expect(mocked.subscribe).not.toHaveBeenCalled();
  });

  it('marks the field invalid for assistive tech on error', async () => {
    const user = userEvent.setup();
    renderNewsletter();

    await user.type(screen.getByLabelText(/email address/i), 'bad');
    await user.click(screen.getByRole('button', { name: /subscribe/i }));

    expect(screen.getByLabelText(/email address/i)).toHaveAttribute('aria-invalid', 'true');
  });
});

describe('Newsletter — successful subscription', () => {
  it('calls the API and shows the message the service returned', async () => {
    const user = userEvent.setup();
    mocked.subscribe.mockResolvedValue({
      pending: true,
      message: 'Almost there — check your inbox to confirm your subscription.',
    });

    renderNewsletter();
    await user.type(screen.getByLabelText(/email address/i), 'ada@example.com');
    await user.click(screen.getByRole('button', { name: /subscribe/i }));

    expect(await screen.findByRole('status')).toHaveTextContent(/check your inbox to confirm/i);
    expect(mocked.subscribe).toHaveBeenCalledWith({ email: 'ada@example.com', market: 'UG' });
  });

  it('sends the selected market with the signup', async () => {
    const user = userEvent.setup();
    mocked.subscribe.mockResolvedValue({ pending: false, message: "You're subscribed." });

    renderWithProviders(<Newsletter />, {
      preloadedState: { ...signedOut(), ...withCurrency('KE', 'KES') },
    });

    await user.type(screen.getByLabelText(/email address/i), 'ada@example.com');
    await user.click(screen.getByRole('button', { name: /subscribe/i }));

    await waitFor(() =>
      expect(mocked.subscribe).toHaveBeenCalledWith({ email: 'ada@example.com', market: 'KE' }),
    );
  });

  it('clears the field after a successful subscription', async () => {
    const user = userEvent.setup();
    mocked.subscribe.mockResolvedValue({ pending: false, message: "You're subscribed." });

    renderNewsletter();
    const input = screen.getByLabelText(/email address/i);
    await user.type(input, 'ada@example.com');
    await user.click(screen.getByRole('button', { name: /subscribe/i }));

    await waitFor(() => expect(input).toHaveValue(''));
  });

  it('trims surrounding whitespace before sending', async () => {
    const user = userEvent.setup();
    mocked.subscribe.mockResolvedValue({ pending: false, message: 'ok' });

    renderNewsletter();
    await user.type(screen.getByLabelText(/email address/i), '  ada@example.com  ');
    await user.click(screen.getByRole('button', { name: /subscribe/i }));

    await waitFor(() =>
      expect(mocked.subscribe).toHaveBeenCalledWith({ email: 'ada@example.com', market: 'UG' }),
    );
  });
});

describe('Newsletter — loading state', () => {
  it('disables the control and announces progress while in flight', async () => {
    const user = userEvent.setup();
    let resolve!: (value: { pending: boolean; message: string }) => void;
    mocked.subscribe.mockReturnValue(new Promise((r) => { resolve = r; }));

    renderNewsletter();
    await user.type(screen.getByLabelText(/email address/i), 'ada@example.com');
    await user.click(screen.getByRole('button', { name: /subscribe/i }));

    const button = screen.getByRole('button', { name: /subscribing/i });
    expect(button).toBeDisabled();
    expect(screen.getByLabelText(/email address/i)).toBeDisabled();

    resolve({ pending: false, message: 'done' });
    await waitFor(() => expect(screen.getByRole('button', { name: /subscribe$/i })).toBeEnabled());
  });

  it('ignores a second submit while one is in flight', async () => {
    const user = userEvent.setup();
    mocked.subscribe.mockReturnValue(new Promise(() => {}));

    renderNewsletter();
    await user.type(screen.getByLabelText(/email address/i), 'ada@example.com');
    const button = screen.getByRole('button', { name: /subscribe/i });
    await user.click(button);
    await user.click(button);

    expect(mocked.subscribe).toHaveBeenCalledTimes(1);
  });
});

describe('Newsletter — backend failure', () => {
  it('reports failure instead of claiming success', async () => {
    const user = userEvent.setup();
    mocked.subscribe.mockRejectedValue(new ApiError('Too many attempts. Try again in a minute.', 429));

    renderNewsletter();
    await user.type(screen.getByLabelText(/email address/i), 'ada@example.com');
    await user.click(screen.getByRole('button', { name: /subscribe/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Too many attempts. Try again in a minute.');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('does not clear the field on failure, so the address is not lost', async () => {
    const user = userEvent.setup();
    mocked.subscribe.mockRejectedValue(new ApiError('Service unavailable.', 503));

    renderNewsletter();
    const input = screen.getByLabelText(/email address/i);
    await user.type(input, 'ada@example.com');
    await user.click(screen.getByRole('button', { name: /subscribe/i }));

    await screen.findByRole('alert');
    expect(input).toHaveValue('ada@example.com');
  });

  it('leaks no internal detail from an unexpected error', async () => {
    const user = userEvent.setup();
    mocked.subscribe.mockRejectedValue(
      new Error('ECONNREFUSED 10.0.3.4:4034 at NewsletterRepository.upsert'),
    );

    renderNewsletter();
    await user.type(screen.getByLabelText(/email address/i), 'ada@example.com');
    await user.click(screen.getByRole('button', { name: /subscribe/i }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).not.toMatch(/ECONNREFUSED|10\.0\.3\.4|Repository/);
    expect(alert).toHaveTextContent(/could not subscribe right now/i);
  });
});
