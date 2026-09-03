import type { UIState } from '../store';
import {
  closeCleanPanel,
  runCleanDelete,
  runCleanScan,
  setCleanAll,
  toggleCleanLoc,
} from '../store';
import { fmt, inline, t } from '../i18n';
import { formatSize } from '../utils';
import type { CleanLocationId } from '../protocol';

const LOC_ICONS: Record<CleanLocationId, string> = {
  user_temp: '🗑',
  crash_dumps: '💥',
  chrome_cache: '🌐',
  edge_cache: '🧭',
  firefox_cache: '🦊',
  thumbnails: '🖼',
};

const LOC_KEY: Record<CleanLocationId, string> = {
  user_temp: 'clean_loc_user_temp',
  crash_dumps: 'clean_loc_crash_dumps',
  chrome_cache: 'clean_loc_chrome_cache',
  edge_cache: 'clean_loc_edge_cache',
  firefox_cache: 'clean_loc_firefox_cache',
  thumbnails: 'clean_loc_thumbnails',
};

export default function CleanupPanel({ store }: { store: UIState }) {
  const S = store.strings;
  if (!store.cleanOpen) return null;

  const { cleanScanning, cleanReport, cleanSel, cleanArmed, cleanDeleting } =
    store;
  const selBytes = (cleanReport?.locations ?? [])
    .filter((l) => cleanSel.has(l.id))
    .reduce((n, l) => n + l.bytes, 0);
  const allLive = cleanReport?.locations ?? [];
  const allSelected = allLive.length > 0 && cleanSel.size === allLive.length;

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={inline(t(S, 'clean_title'))}
    >
      <div className="modal modal-wide">
        <div className="modal-head">
          <div>
            <h2 className="modal-title">{inline(t(S, 'clean_title'))}</h2>
            <p className="modal-sub">{inline(t(S, 'clean_desc'))}</p>
          </div>
          <button
            type="button"
            className="icon-btn"
            onClick={closeCleanPanel}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="dup-actions">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => void runCleanScan()}
            disabled={cleanScanning || cleanDeleting}
          >
            {inline(t(S, 'clean_scan'))}
          </button>
        </div>

        {cleanScanning && (
          <div className="progress-block">
            <div className="progress-meta">
              <span>{inline(t(S, 'clean_scanning'))}</span>
            </div>
            <div className="progress-track">
              <div
                className="progress-fill"
                style={{
                  width: '100%',
                  animation: 'dup-pulse 1.2s ease-in-out infinite',
                }}
              />
            </div>
          </div>
        )}

        {!cleanScanning && !cleanReport && (
          <div className="dup-none">
            {inline(t(S, 'clean_before_scan'))}
          </div>
        )}

        {!cleanScanning && cleanReport && (
          <div className="space-results">
            {allLive.length === 0 ? (
              <div className="dup-none">{inline(t(S, 'clean_none'))}</div>
            ) : (
              <>
                <div className="clean-summary">
                  <button
                    type="button"
                    className="clean-select-all"
                    onClick={() => setCleanAll(!allSelected)}
                  >
                    {allSelected
                      ? inline(t(S, 'clean_deselect_all'))
                      : inline(t(S, 'clean_select_all'))}
                  </button>
                  <span className="clean-summary-total">
                    {inline(
                      fmt(t(S, 'clean_summary_total'), {
                        bytes: formatSize(cleanReport.total_bytes),
                      }),
                    )}
                  </span>
                </div>

                <div className="clean-list">
                  {allLive.map((loc) => {
                    const checked = cleanSel.has(loc.id);
                    const sub = fmt(t(S, 'clean_row_hint'), {
                      files: loc.files,
                      bytes: formatSize(loc.bytes),
                    });
                    return (
                      <label
                        key={loc.id}
                        className={`clean-row${checked ? ' is-checked' : ''}`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleCleanLoc(loc.id)}
                        />
                        <span className="clean-row-icon" aria-hidden="true">
                          {LOC_ICONS[loc.id] ?? '🗑'}
                        </span>
                        <span className="clean-row-main">
                          <span className="clean-row-name">
                            {inline(t(S, LOC_KEY[loc.id] ?? 'clean_loc_user_temp'))}
                          </span>
                          <span className="clean-row-sub" dir="ltr">
                            {loc.id}
                          </span>
                        </span>
                        <span className="clean-row-meta">{inline(sub)}</span>
                      </label>
                    );
                  })}
                </div>

                <div className="modal-foot dup-foot">
                  <span className="dup-hint">
                    {inline(t(S, 'clean_confirm_note'))}
                  </span>
                  {cleanSel.size > 0 && (
                    <span className="clean-reclaim">
                      {inline(
                        fmt(t(S, 'clean_freed_sel'), {
                          size: formatSize(selBytes),
                        }),
                      )}
                    </span>
                  )}
                  <button
                    type="button"
                    className={`btn${cleanArmed ? ' btn-danger' : ' btn-secondary'}`}
                    disabled={cleanSel.size === 0 || cleanDeleting}
                    onClick={() => void runCleanDelete()}
                  >
                    {cleanArmed
                      ? inline(t(S, 'clean_arm'))
                      : inline(t(S, 'clean_delete'))}
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
