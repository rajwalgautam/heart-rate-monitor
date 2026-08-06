// Two palettes with an identical key set so components never branch on mode —
// they read `useTheme().colors.x`. Shared scales (spacing/radius/font/shadow)
// are mode-independent. Ported from its-a-rock; accent swapped to a heart red.

export interface Palette {
  /** App background behind all screens. */
  background: string;
  /** Cards, tiles, sheets sitting on the background. */
  surface: string;
  /** A slightly raised/inset surface (inputs, segmented controls). */
  surfaceAlt: string;
  /** Primary text. */
  textPrimary: string;
  /** Secondary/supporting text. */
  textSecondary: string;
  /** De-emphasized text (placeholders, captions). */
  textMuted: string;
  /** Hairline borders and dividers. */
  border: string;
  /** Brand/accent used for primary actions and the live BPM readout. */
  primary: string;
  /** Foreground drawn on top of `primary`. */
  onPrimary: string;
  /** Muted brand tint for subtle fills. */
  primaryMuted: string;
  /** Connected / success state. */
  success: string;
  /** Destructive actions and disconnection. */
  danger: string;
  /** Warning, and the "stale data" marker on the baseline card. */
  warning: string;
  /** The 24h baseline accent — deliberately cool, to contrast with `primary`. */
  baseline: string;
  tabBar: string;
  tabBarActive: string;
  tabBarInactive: string;
}

export const LIGHT: Palette = {
  background: '#F5F5F4',
  surface: '#FFFFFF',
  surfaceAlt: '#ECECEA',
  textPrimary: '#1C1917',
  textSecondary: '#57534E',
  textMuted: '#A8A29E',
  border: '#E7E5E4',
  primary: '#DC2626',
  onPrimary: '#FFFFFF',
  primaryMuted: '#FEE2E2',
  success: '#16A34A',
  danger: '#B91C1C',
  warning: '#D97706',
  baseline: '#2563EB',
  tabBar: '#FFFFFF',
  tabBarActive: '#DC2626',
  tabBarInactive: '#A8A29E',
};

export const DARK: Palette = {
  background: '#0E0E10',
  surface: '#1A1A1D',
  surfaceAlt: '#242427',
  textPrimary: '#FAFAF9',
  textSecondary: '#A8A29E',
  textMuted: '#6B6660',
  border: '#2A2A2E',
  primary: '#EF4444',
  onPrimary: '#1C1917',
  primaryMuted: '#3A1515',
  success: '#22C55E',
  danger: '#F87171',
  warning: '#F59E0B',
  // Steps down from #60A5FA: that value sits at OKLCH L 0.714, outside the
  // dark-mode band (0.48–0.67), so it read too light against the chart surface.
  // #3B82F6 passes the lightness band, chroma floor, CVD separation from
  // `primary` (ΔE 26.7 protan), and 3:1 contrast. Dark mode is chosen here, not
  // derived by flipping the light palette.
  baseline: '#3B82F6',
  tabBar: '#141416',
  tabBarActive: '#EF4444',
  tabBarInactive: '#6B6660',
};

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const RADIUS = {
  sm: 6,
  md: 10,
  lg: 16,
  xl: 24,
  full: 9999,
} as const;

export const FONT_SIZE = {
  xs: 11,
  sm: 13,
  md: 15,
  lg: 17,
  xl: 22,
  xxl: 28,
  xxxl: 36,
  display: 72,
} as const;

export const SHADOW = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },
} as const;
