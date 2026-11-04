// Literal hex mirrors of variables.css custom properties. Recharts SVG props (fill/stroke)
// don't reliably resolve CSS var() across all internals, so charts use these directly.
// Keep in sync with variables.css if those color values ever change.
export const CHART_COLORS = {
  accent: '#3b82f6',
  accentDark: '#2563eb',
  success: '#10b981',
  warning: '#f59e0b',
  danger: '#ef4444',
  textSecondary: '#64748b',
  border: '#e2e8f0',
  series: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316', '#64748b'],
} as const;
