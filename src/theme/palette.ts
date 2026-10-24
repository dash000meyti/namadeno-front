/**
 * Namadno UI palette (mirrors src/styles/tokens.css).
 * MUI needs concrete colors for its own computations; everything else in the
 * product reads the CSS variables directly (var(--primary-main) etc.).
 */
export const palette = {
  grey: {
    50: '#FCFCFE', 100: '#F8F9FC', 200: '#F1F3F8', 300: '#DEE2EB', 400: '#C3C9D6',
    500: '#8F97AA', 600: '#636B7F', 700: '#454C5E', 800: '#1F2433', 900: '#141826',
  },
  primary: { lighter: '#DDE0FB', light: '#8E97F0', main: '#3A47CD', dark: '#2A34A0', darker: '#1A2070', contrastText: '#FFFFFF' },
  secondary: { lighter: '#D4EAF3', light: '#8FC1D6', main: '#4686A6', dark: '#2F6480', darker: '#1C4257', contrastText: '#FFFFFF' },
  info: { lighter: '#D3EBF8', light: '#7FC0E6', main: '#3B8EC7', dark: '#25628F', contrastText: '#FFFFFF' },
  success: { lighter: '#DAF3E7', light: '#9BD9BF', main: '#55B08C', dark: '#2F7D5C', darker: '#1B5540', contrastText: '#0B2A1C' },
  warning: { lighter: '#FBEFD3', light: '#F0CB7C', main: '#D99A2B', dark: '#9E6A14', contrastText: '#1F2433' },
  error: { lighter: '#FBDCDC', light: '#F09A9A', main: '#D94A4A', dark: '#A32C2C', contrastText: '#FFFFFF' },
  /** Dark surfaces (tokens.css .th-dark --bg-default / --bg-paper). */
  ink: { default: '#000000', paper: '#1C1C1E' },
} as const;

/** Asset accent colors used by bands, charts and chips. */
export const assetColors = {
  rial: { band: '#4F5770', bandDark: '#353B4E', line: '#4F5770', lineDark: '#9AA3B8' },
  gold: { band: '#C9962E', bandDark: '#8F6A1F', line: '#C9962E', lineDark: '#E6B65A' },
  fixed: { band: '#3F7E9E', bandDark: '#2B5A72', line: '#3F7E9E', lineDark: '#7DB5D1' },
} as const;
