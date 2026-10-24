import { createTheme, type ThemeOptions } from '@mui/material/styles';
import { palette } from './palette';

const fontFamily = "'IRANSansX', Tahoma, sans-serif";

/** MUI theme for the Namadno UI design system (RTL, IRANSansX, glassy surfaces). */
export function createNamadnoTheme(mode: 'light' | 'dark') {
  const dark = mode === 'dark';
  const options: ThemeOptions = {
    direction: 'rtl',
    palette: {
      mode,
      primary: palette.primary,
      secondary: palette.secondary,
      info: palette.info,
      success: palette.success,
      warning: palette.warning,
      error: palette.error,
      grey: palette.grey,
      background: dark
        ? { default: palette.ink.default, paper: palette.ink.paper }
        : { default: '#FFFFFF', paper: '#FFFFFF' },
      text: dark
        ? { primary: '#F5F5F7', secondary: '#98989D', disabled: '#636366' }
        : { primary: '#1D1D1F', secondary: '#6E6E73', disabled: '#A1A1A6' },
      divider: 'rgba(143,151,170,0.2)',
    },
    shape: { borderRadius: 8 },
    typography: {
      fontFamily,
      button: { fontWeight: 700, textTransform: 'none' },
      h1: { fontWeight: 800 }, h2: { fontWeight: 800 }, h3: { fontWeight: 700 },
      h4: { fontWeight: 700 }, h5: { fontWeight: 700 }, h6: { fontWeight: 700 },
    },
    components: {
      MuiCssBaseline: { styleOverrides: { body: { fontFamily } } },
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: { root: { borderRadius: 8, fontWeight: 700, minHeight: 40 } },
      },
      MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } },
      MuiDialog: {
        styleOverrides: {
          paper: {
            borderRadius: 16,
            background: 'var(--glass-bg)',
            backdropFilter: 'blur(20px) saturate(140%)',
            boxShadow: 'var(--shadow-dropdown)',
          },
        },
      },
      MuiDrawer: { styleOverrides: { paper: { backgroundImage: 'none' } } },
      MuiTooltip: { styleOverrides: { tooltip: { fontFamily, fontSize: 12 } } },
      MuiSnackbarContent: { styleOverrides: { root: { fontFamily } } },
    },
  };
  return createTheme(options);
}
