import { useTheme } from '../../../hooks/useTheme';

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
      style={{
        background: 'none',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-full)',
        width: 32,
        height: 32,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        fontSize: '15px',
      }}
    >
      {theme === 'light' ? '🌙' : '☀️'}
    </button>
  );
}
