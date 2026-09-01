'use client';

import { useTheme } from 'next-themes';
import { MoonIcon, SunIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();

  // resolvedTheme is undefined on the server and on the first client render, and defined
  // afterwards. Keying off that avoids a `mounted` flag set from an effect — the icon simply
  // occupies its space until the real theme is known, so there is no hydration mismatch.
  const known = resolvedTheme !== undefined;
  const isDark = resolvedTheme === 'dark';

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
    >
      {known ? isDark ? <SunIcon /> : <MoonIcon /> : <span className="size-4" />}
    </Button>
  );
}
