import { useTheme } from './useTheme'

export function ThemeToggle({ floating = false }: { floating?: boolean }) {
  const [theme, toggle] = useTheme()
  const isDark = theme === 'dark'
  const nextLabel = isDark ? 'Switch to light theme' : 'Switch to dark theme'

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isDark}
      className={`toggle-switch theme-switch${isDark ? ' on' : ''}${floating ? ' floating' : ''}`}
      onClick={toggle}
      aria-label="Dark theme"
      title={nextLabel}
    >
      <span className="toggle-switch-thumb">
        <svg
          className={`theme-icon${isDark ? '' : ' is-visible'}`}
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2" />
          <path d="M12 20v2" />
          <path d="m4.93 4.93 1.41 1.41" />
          <path d="m17.66 17.66 1.41 1.41" />
          <path d="M2 12h2" />
          <path d="M20 12h2" />
          <path d="m4.93 19.07 1.41-1.41" />
          <path d="m17.66 6.34 1.41-1.41" />
        </svg>
        <svg
          className={`theme-icon${isDark ? ' is-visible' : ''}`}
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
        </svg>
      </span>
    </button>
  )
}
