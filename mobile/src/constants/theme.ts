export const Colors = { 
   
  primary:     '#ff9900',   // --color-primary 
  primaryDark: '#e47911',   // --color-primary-dark 
  secondary:   '#131921',   // --color-nav-bg 
  accent:      '#febd69',   // --color-accent-yellow 
 
  // ── Navigation / chrome ───────────────────────────────────────────────── 
  nav: { 
    primary:   '#131921',   // --color-nav-bg 
    secondary: '#232f3e',   // --color-nav-bg-secondary 
    hover:     '#37475a',   // --color-nav-bg-hover 
  }, 
 
  yellow:     '#febd69',    // --color-accent-yellow 
  yellowDark: '#f3a847',    // --color-accent-yellow-dark 
  orange:     '#ff9900',    // --color-primary 
  orangeDark: '#e47911',    // --color-primary-dark 
 
  link:      '#007185',     // --color-interactive 
  linkHover: '#c7511f',     // --color-interactive-hover 
 
  // ── Semantic ──────────────────────────────────────────────────────────── 
  success: '#067d62',       // --color-success 
  warning: '#f3a847',       // --color-warning 
  error:   '#c7311a',       // --color-danger 
  info:    '#007185',       // --color-interactive (web has no distinct info token) 
 
  /** Prices are their own colour on the web, distinct from body text. */ 
  price:  '#b12704',        // --color-urgent 
  rating: '#c45500',        // --color-rating 
 
  white: '#FFFFFF', 
  black: '#000000', 
 
  border:      '#dddddd',   // --color-border 
  borderLight: '#e7e7e7',   // --color-border-light 
 
  // ── Neutral ramp ──────────────────────────────────────────────────────── 
  // The keys are unchanged so existing `Colors.gray.N` call sites keep working, 
  // but the values are re-anchored on the web's real neutrals instead of 
  // Tailwind's blue-tinted defaults (#F9FAFB … #111827), which belonged to no 
  // design system here. 100-500, 800 and 900 are web tokens verbatim; 50, 600 
  // and 700 are interpolated to keep the ramp evenly stepped. 
  gray: { 
    50:  '#f7f7f7', 
    100: '#f3f3f3',         // --color-surface-muted 
    200: '#eaeded',         // --color-surface-alt 
    300: '#e7e7e7',         // --color-border-light 
    400: '#dddddd',         // --color-border 
    500: '#888888',         // --color-text-muted 
    600: '#6b6b6b', 
    700: '#4a4a4a', 
    800: '#232f3e',         // --color-nav-bg-secondary 
    900: '#0f1111',         // --color-ink 
  }, 
 
  background: { 
    primary:   '#ffffff',   // --color-surface / --color-paper 
    secondary: '#f3f3f3',   // --color-surface-muted 
    alt:       '#eaeded',   // --color-surface-alt 
    card:      '#ffffff',   // --color-surface 
  }, 
 
  text: { 
    primary: '#0f1111',     // --color-text-primary / --color-ink 
    // The web's own --color-text-secondary is #eff6f9 — a near-white that is 
    // unreadable on the white surfaces it is used on there. Mapped to 
    // --color-text-muted instead, which is the readable secondary the web 
    // actually needs; porting #eff6f9 verbatim would make body copy invisible. 
    secondary: '#888888',   // --color-text-muted 
    muted:     '#888888',   // --color-text-muted 
    inverse:   '#ffffff',   // --color-text-on-dark 
    onAccent:  '#111111',   // --color-text-on-yellow 
  }, 
} as const; 
 
export const Spacing = { 
  xs:  4, 
  sm:  8, 
  md:  16, 
  lg:  24, 
  xl:  32, 
  xxl: 48, 
} as const; 
 
export const BorderRadius = { 
  sm:   4, 
  md:   8, 
  lg:   12, 
  xl:   16, 
  full: 9999, 
} as const; 
 
export const FontSize = { 
  xs:   11, 
  sm:   13, 
  md:   15, 
  lg:   17, 
  xl:   20, 
  xxl:  24, 
  xxxl: 30, 
} as const; 
 
export const FontFamily = { 
  regular:   'Inter-Regular', 
  medium:    'Inter-Medium', 
  semiBold:  'Inter-SemiBold', 
  bold:      'Inter-Bold', 
} as const; 
 
export const Shadow = { 
  sm: { 
    shadowColor: '#000', 
    shadowOffset: { width: 0, height: 1 }, 
    shadowOpacity: 0.05, 
    shadowRadius: 2, 
    elevation: 1, 
  }, 
  md: { 
    shadowColor: '#000', 
    shadowOffset: { width: 0, height: 2 }, 
    shadowOpacity: 0.08, 
    shadowRadius: 8, 
    elevation: 3, 
  }, 
  lg: { 
    shadowColor: '#000', 
    shadowOffset: { width: 0, height: 4 }, 
    shadowOpacity: 0.12, 
    shadowRadius: 16, 
    elevation: 6, 
  }, 
} as const; 
