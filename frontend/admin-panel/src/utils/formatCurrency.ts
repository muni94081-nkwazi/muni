// Compact currency/number formatting shared by dashboard & analytics widgets.
export function formatCompactCurrency(value: number, currency = 'UGX'): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `${currency} ${(value / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `${currency} ${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${currency} ${(value / 1_000).toFixed(1)}K`;
  return `${currency} ${value.toLocaleString()}`;
}

export function formatCompactNumber(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toLocaleString();
}
