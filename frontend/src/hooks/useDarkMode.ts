import { useCallback, useEffect, useState } from 'react';

const KEY = 'mindspark-theme';

function apply(dark: boolean) {
  document.documentElement.classList.toggle('dark', dark);
}

/** Apply saved theme before first paint when this module loads. */
const initialDark = localStorage.getItem(KEY) === 'dark';
apply(initialDark);

export function useDarkMode() {
  const [dark, setDark] = useState<boolean>(() => initialDark);

  useEffect(() => {
    apply(dark);
    localStorage.setItem(KEY, dark ? 'dark' : 'light');
  }, [dark]);

  const toggle = useCallback(() => setDark((d) => !d), []);

  return { dark, toggle };
}
