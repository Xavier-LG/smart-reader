import { useEffect } from 'react';

export function useThemeEffect(theme: 'light' | 'dark') {
  useEffect(() => {
    const root = window.document.documentElement;

    if (theme === 'dark') {
      root.classList.add('dark');
      root.style.colorScheme = 'dark';
      return;
    }

    root.classList.remove('dark');
    root.style.colorScheme = 'light';
  }, [theme]);
}
