import { DEFAULT_CURRENCY, ORDER_STATUS_LABELS, PAYMENT_METHOD_LABELS } from './constants';

export function formatMoney(amount: number, currency: string = DEFAULT_CURRENCY): string {
  // Intl.NumberFormat doesn't have great built-in support for UGX
  // (no minor unit in practice — Ugandans don't deal in cents), so we
  // format as a plain grouped integer with the currency code suffixed,
  // which is how prices are actually written in Ugandan shops.
  const rounded = Math.round(amount);
  const grouped = rounded.toLocaleString('en-US');
  return `${currency} ${grouped}`;
}

export function formatDate(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function formatDateTime(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatRelativeTime(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);

  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(value);
}

export function orderStatusLabel(status: string): string {
  return ORDER_STATUS_LABELS[status] ?? status;
}

export function paymentMethodLabel(method: string | null): string {
  if (!method) return '—';
  return PAYMENT_METHOD_LABELS[method] ?? method;
}

export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 1).trimEnd() + '…';
}

export function pluralize(count: number, singular: string, plural?: string): string {
  return count === 1 ? singular : (plural ?? `${singular}s`);
}
