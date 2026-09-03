import type { UIState } from '../store';
import { toggleLanguage, toggleTheme } from '../store';
import { t } from '../i18n';

function SunIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
  );
}

export default function Header({ store }: { store: UIState }) {
  const title = t(store.strings, 'app_title');
  const langLabel = store.lang === 'fa' ? 'EN' : 'فا';

  return (
    <header className="app-header">
      <div className="logo">
        <svg className="logo-mark" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <path d="M12 10v6M9 13h6" />
        </svg>
        <span className="logo-name">{title}</span>
        {store.version && <span className="logo-version">v{store.version}</span>}
      </div>

      <div className="header-actions">
        <button
          type="button"
          className="header-btn"
          title={store.lang === 'fa' ? 'Switch to English' : 'تغییر زبان به فارسی'}
          onClick={() => void toggleLanguage()}
        >
          <span className="header-btn-label">{langLabel}</span>
        </button>
        <button
          type="button"
          className="header-btn"
          title={store.theme === 'dark' ? 'Light theme' : 'Dark theme'}
          onClick={() => void toggleTheme()}
        >
          {store.theme === 'dark' ? <SunIcon /> : <MoonIcon />}
        </button>
      </div>
    </header>
  );
}
