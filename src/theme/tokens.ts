/**
 * Bloom design tokens. Semantic names only — components never use raw hex.
 *
 * Contrast rules (WCAG AA 4.5:1), verified for these values:
 *  - `ink` and `muted` are the general text colours (plus `cycleText` for cycle numbers/phases).
 *    muted on bg/surface/soft ≥ 4.6:1.
 *  - Accent colours (cycle, steps, sleep, heart, spo2) are for graphics, icons and fills —
 *    never for body text.
 *  - `onInk` is the text colour used on top of an `ink` filled (primary) button.
 */
import { Platform } from 'react-native';

export type ColorScheme = 'light' | 'dark';

export interface ColorTokens {
  bg: string;
  surface: string;
  surfaceAlt: string;
  ink: string;
  onInk: string;
  muted: string;
  line: string;
  focus: string;
  shadow: string;
  danger: string;
  cycle: string;
  cycleSoft: string;
  /**
   * Deep rose for cycle phase names / numbers as TEXT on light and soft-pink surfaces
   * (#A8325A on #F9DCE4 = 5.0:1, on white 6.4:1; dark #F5A3BA on dark surfaces ≥ 6.5:1).
   */
  cycleText: string;
  steps: string;
  stepsSoft: string;
  sleep: string;
  sleepSoft: string;
  heart: string;
  heartSoft: string;
  spo2: string;
  spo2Soft: string;
  /** Sleep stage colours (graphics only). */
  stageDeep: string;
  stageLight: string;
  stageRem: string;
  stageAwake: string;
  stageAsleep: string;
}

/** 18% opacity soft variant for dark mode, as an 8-digit hex. */
const soft = (hex: string) => `${hex}2E`; // 0x2E = 46 ≈ 18% of 255

const light: ColorTokens = {
  bg: '#FBF6F1',
  surface: '#FFFFFF',
  surfaceAlt: '#F6EEE8',
  ink: '#2A1E2C',
  onInk: '#FBF6F1',
  muted: '#6E5F6C',
  line: '#EDE3DC',
  focus: '#5B5BD6',
  shadow: '#3B1F3A',
  danger: '#B3261E',
  cycle: '#D9577B',
  cycleSoft: '#F9DCE4',
  cycleText: '#A8325A',
  steps: '#D97A2B',
  stepsSoft: '#FBE6D2',
  sleep: '#5B5BD6',
  sleepSoft: '#E3E3FA',
  heart: '#E0484E',
  heartSoft: '#FADBDC',
  spo2: '#1F8F82',
  spo2Soft: '#D3F0EC',
  stageDeep: '#3A3AA8',
  stageLight: '#8B8BEA',
  stageRem: '#B76BD6',
  stageAwake: '#E7B24A',
  stageAsleep: '#B9B9E6',
};

const dark: ColorTokens = {
  bg: '#16111A',
  surface: '#211A25',
  surfaceAlt: '#2A2230',
  ink: '#F5EDF2',
  onInk: '#16111A',
  muted: '#B3A5B1',
  line: '#33293A',
  focus: '#8A8AF0',
  shadow: '#000000',
  danger: '#FF8A80',
  cycle: '#F07A9A',
  cycleSoft: soft('#F07A9A'),
  cycleText: '#F5A3BA',
  steps: '#F0A15C',
  stepsSoft: soft('#F0A15C'),
  sleep: '#8A8AF0',
  sleepSoft: soft('#8A8AF0'),
  heart: '#F07276',
  heartSoft: soft('#F07276'),
  spo2: '#4CC2B4',
  spo2Soft: soft('#4CC2B4'),
  stageDeep: '#6C6CF5',
  stageLight: '#A9A9F5',
  stageRem: '#D08BEE',
  stageAwake: '#F0C266',
  stageAsleep: '#5F5F8C',
};

export const colors: Record<ColorScheme, ColorTokens> = { light, dark };

/** 4/8 pt spacing scale. */
export const space = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radius = {
  card: 24,
  chip: 14,
  pill: 999,
} as const;

/** Minimum touch target (dp). */
export const touch = { min: 44, gap: 8 } as const;

export const fonts = {
  display: 'InstrumentSerif_400Regular',
  displayItalic: 'InstrumentSerif_400Regular_Italic',
  body: 'Manrope_400Regular',
  medium: 'Manrope_500Medium',
  semibold: 'Manrope_600SemiBold',
  bold: 'Manrope_700Bold',
} as const;

export const type = {
  hero: { fontFamily: fonts.display, fontSize: 56, lineHeight: 60 },
  display: { fontFamily: fonts.display, fontSize: 44, lineHeight: 50 },
  displaySm: { fontFamily: fonts.display, fontSize: 32, lineHeight: 38 },
  title: { fontFamily: fonts.display, fontSize: 28, lineHeight: 34 },
  heading: { fontFamily: fonts.semibold, fontSize: 16, lineHeight: 24 },
  body: { fontFamily: fonts.body, fontSize: 16, lineHeight: 24 },
  bodyStrong: { fontFamily: fonts.semibold, fontSize: 16, lineHeight: 24 },
  label: { fontFamily: fonts.semibold, fontSize: 13, lineHeight: 18, letterSpacing: 0.4 },
  caption: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 18 },
} as const;

export type TypeVariant = keyof typeof type;

export const motion = {
  fast: 150,
  base: 220,
  slow: 300,
} as const;

export function shadow(c: ColorTokens) {
  return Platform.select({
    android: { elevation: 2, shadowColor: c.shadow },
    default: {
      shadowColor: c.shadow,
      shadowOpacity: 0.08,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 },
    },
  });
}

export interface Theme {
  scheme: ColorScheme;
  c: ColorTokens;
}
