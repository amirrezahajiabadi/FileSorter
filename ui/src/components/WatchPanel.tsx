import type { UIState } from '../store';
import {
  closeWatch,
  watchAddCurrent,
  watchBrowseAdd,
  watchRemove,
  watchStart,
  watchStop,
} from '../store';
import { inline, t } from '../i18n';

function EyeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export default function WatchPanel({ store }: { store: UIState }) {
  const S = store.strings;
  const { watchRunning, watchFolders, watchLog, folder } = store;

  if (!store.watchOpen) return null;

  const title = t(S, 'watch_title');
  const statusLabel = watchRunning ? t(S, 'watch_running') : t(S, 'watch_stopped');
  const statusClass = watchRunning ? 'watch-status watch-status-on' : 'watch-status';
  const totalMoved = watchFolders.reduce((n, r) => n + r.moved, 0);
  const alreadyWatched = !!folder && watchFolders.some((r) => r.path === folder);

  return (
    <div className="watch-backdrop" onClick={closeWatch}>
      <aside
        className="watch-panel"
        role="dialog"
        aria-label={inline(title)}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="watch-head">
          <div className="watch-head-title">
            <span className="watch-icon"><EyeIcon /></span>
            <h2>{inline(title)}</h2>
            <span className={statusClass}>{inline(statusLabel)}</span>
          </div>
          <button type="button" className="btn-ghost" onClick={closeWatch} aria-label="Close">
            ✕
          </button>
        </header>

        <p className="watch-desc">{inline(t(S, 'watch_desc'))}</p>

        {/* Start / stop */}
        <div className="watch-controls">
          <button
            type="button"
            className="btn btn-accent"
            disabled={watchFolders.length === 0}
            onClick={() => (watchRunning ? void watchStop() : void watchStart())}
          >
            {inline(watchRunning ? t(S, 'watch_stop') : t(S, 'watch_start'))}
          </button>
          {totalMoved > 0 && (
            <span className="watch-total" aria-hidden="true">
              {totalMoved} <span className="watch-total-label">{inline(t(S, 'watch_sorted_count'))}</span>
            </span>
          )}
        </div>

        {/* Folder list */}
        <div className="watch-folders">
          <h3 className="watch-section-title">{inline(t(S, 'watch_folders_label'))}</h3>
          {watchFolders.length === 0 ? (
            <p className="watch-empty">{inline(t(S, 'watch_empty'))}</p>
          ) : (
            <ul className="watch-folder-list">
              {watchFolders.map((row) => (
                <li key={row.path} className="watch-folder-row">
                  <div className="watch-folder-info">
                    <span className="watch-folder-path" title={row.path}>{row.path}</span>
                    <span className="watch-folder-stats">
                      <span className="stat stat-ok" title="moved">{row.moved}</span>
                      <span className="stat stat-skip" title="skipped">{row.skipped}</span>
                      <span className="stat stat-fail" title="failed">{row.failed}</span>
                    </span>
                  </div>
                  <button
                    type="button"
                    className="btn btn-danger btn-sm"
                    onClick={() => void watchRemove(row.path)}
                  >
                    {inline(t(S, 'watch_remove'))}
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="watch-add-row">
            {folder && !alreadyWatched && (
              <button type="button" className="btn btn-primary btn-sm" onClick={() => void watchAddCurrent()}>
                {inline(t(S, 'watch_add_selected'))}
              </button>
            )}
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => void watchBrowseAdd()}>
              {inline(t(S, 'watch_add_browse'))}
            </button>
          </div>
        </div>

        {/* Activity feed */}
        <div className="watch-log">
          <h3 className="watch-section-title">{inline(t(S, 'watch_log_heading'))}</h3>
          {watchLog.length === 0 ? (
            <p className="watch-empty">{inline(t(S, 'watch_no_log'))}</p>
          ) : (
            <ul className="watch-log-list">
              {watchLog.slice(-10).map((line) => (
                <li key={line.id} className={`watch-log-line watch-log-${line.kind}`}>
                  {line.text}
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </div>
  );
}
