'use client';

import { AppRouterCacheProvider } from '@mui/material-nextjs/v15-appRouter';
import { prefixer } from 'stylis';
import rtlPlugin from 'stylis-plugin-rtl';
import { ColorModeProvider } from './ColorModeProvider';

/**
 * Emotion cache with RTL flipping for MUI styles.
 * NOTE: styles written in `sx`/`styled` are flipped (write them as LTR: marginLeft → becomes right).
 * Inline `style={{...}}` props are NOT flipped — ported design markup uses inline styles as-is.
 */
export default function ThemeRegistry({ children }: { children: React.ReactNode }) {
  return (
    <AppRouterCacheProvider options={{ key: 'muirtl', stylisPlugins: [prefixer, rtlPlugin] }}>
      <ColorModeProvider>{children}</ColorModeProvider>
    </AppRouterCacheProvider>
  );
}
