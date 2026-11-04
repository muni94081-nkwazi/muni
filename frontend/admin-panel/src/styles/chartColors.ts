// Literal hex mirrors of variables.css custom properties. Recharts SVG props (fill/stroke)
// don't reliably resolve CSS var() across all internals, so charts use these directly.
// Keep in sync with variables.css if those color values ever change.
export const CHART_COLORS = {
  accent: '#e94560',
  accentHover: '#d13d56',
  success: '#00b894',
  warning: '#fdcb6e',
  danger: '#d63031',
  info: '#0984e3',
  textSecondary: '#636e72',
  border: '#dfe6e9',
  series: ['#e94560', '#0984e3', '#00b894', '#fdcb6e', '#a55eea', '#26de81', '#fd9644', '#4b6584'],
} as const;
