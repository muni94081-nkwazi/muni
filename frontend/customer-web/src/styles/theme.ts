
export const theme = {
  color: {
    ink: '#1A1A16',
    paper: '#FCF8F1',
    marketGreen: '#69B8D6',
    marketGreenDark: '#0A3526',
    marigold: '#F2A93B',
    marigoldDark: '#D99422',
    terracotta: '#D94F30',
    terracottaDark: '#B73F24',
    surface: '#FFFFFF',
    surfaceMuted: '#F4EFE4',
    border: '#E3DBC8',
    textSecondary: '#5C574A',
    success: '#2F7A4D',
  },
  font: {
    display: "'Space Grotesk', 'Segoe UI', sans-serif",
    body: "'Inter', 'Segoe UI', sans-serif",
    mono: "'SFMono-Regular', 'Consolas', monospace",
  },
  breakpoint: {
    sm: '640px',
    md: '768px',
    lg: '1024px',
    xl: '1240px',
  },
} as const;

export type Theme = typeof theme;
