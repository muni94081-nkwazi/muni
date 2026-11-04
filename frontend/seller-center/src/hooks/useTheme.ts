import { useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '../store/hooks/useAppSelector';
import { setTheme } from '../store/slices/uiSlice';

const STORAGE_KEY = 'seller_theme';

export function useTheme() {
  const dispatch = useAppDispatch();
  const theme = useAppSelector((state) => state.ui.theme);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') {
      dispatch(setTheme(stored));
    }
  }, [dispatch]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const toggleTheme = () => dispatch(setTheme(theme === 'light' ? 'dark' : 'light'));

  return { theme, toggleTheme };
}
