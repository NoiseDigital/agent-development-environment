'use client';

import { useTheme } from '../../contexts/ThemeContext';

// Sun/moon theme switch. Icon-only — shows the icon of the theme it will switch
// TO (sun while dark, moon while light), so the button always reads as the
// action. Same compact button in both the expanded and collapsed sidebar.

const SunIcon = () => (
  <svg className="w-[18px] h-[18px] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="4" strokeWidth={1.75} />
    <path
      strokeLinecap="round"
      strokeWidth={1.75}
      d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32l1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41m11.32-11.32l1.41-1.41"
    />
  </svg>
);

const MoonIcon = () => (
  <svg className="w-[18px] h-[18px] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
  </svg>
);

export default function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const next = theme === 'dark' ? 'light' : 'dark';
  const label = `Switch to ${next} mode`;

  return (
    <button
      type="button"
      onClick={toggle}
      title={label}
      aria-label={label}
      className="w-9 h-9 flex items-center justify-center rounded-lg text-subtle hover:bg-surface hover:text-foreground transition-colors duration-150"
    >
      {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}
