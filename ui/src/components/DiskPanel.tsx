import type { UIState } from '../store';
import {
  closeDiskPanel,
  diskScanBrowse,
  diskScanCurrent,
} from '../store';
import { inline, t } from '../i18n';
import { formatSize, percent } from '../utils';

const BAR_COLORS = [
  '#7c73ff',
  '#3b82f6',
  '#00d4aa',
  '#f59e0b',
  '#f87171',
  '#8b5cf6',
  '#60a5fa',
];

function FileGlyph(name: string): string {
  const lower = name.toLowerCase();
  if (/\.(jpe?g|png|gif|webp|svg|heic)$/.test(lower)) return '🖼';
  if (/\.(mp4|mkv|mov|avi)$/.test(lower)) return '🎬';
  if (/\.(mp3|wav|flac|m4a)$/.test(lower)) return '🎵';
  if (/\.(zip|rar|7z|tar|gz)$/.test(lower)) return '🗜';
  if (/\.(pdf|docx?|xlsx?|pptx?|txt)$/.test(lower)) return '📄';
  return '📎';
}

function fileName(path: string): string {
  return path.split(/[\/]/).pop() ?? path;
}

function dirName(path: string): string {
  return path.split(/[\/]/).slice(0, -1).join('/');
}

export default function DiskPanel({ store }: { store: UIState }) {
  const S = store.strings;

  if (!store.diskOpen) return null;

  const { diskScanning, diskProcessed, diskBytes, diskReport, categories } =
    store;
  const totalBytes = diskReport?.total_bytes ?? 0;
  const byCat = diskReport?.by_category ?? {};

  // Chart rows: every category that has any bytes, largest first.
  const chart = categories
    .filter((c) => (byCat[c.id]?.bytes ?? 0) > 0)
    .sort((a, b) => byCat[b.id].bytes - byCat[a.id].bytes);
  const topFiles = diskReport?.top_files ?? [];

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={inline(t(S, 'space_title'))}
    >
      <div className="modal modal-wide">
        <div className="modal-head">
          <div>
            <h2 className="modal-title">{inline(t(S, 'space_title'))}</h2>
            <p className="modal-sub">{inline(t(S, 'space_desc'))}</p>
          </div>
          <button
            type="button"
            className="icon-btn"
            onClick={closeDiskPanel}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="dup-actions">
          {store.folder && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => void diskScanCurrent()}
            >
              {inline(t(S, 'space_scan_current'))}
            </button>
          )}
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => void diskScanBrowse()}
          >
            {inline(t(S, 'space_scan_browse'))}
          </button>
        </div>

        {store.diskScanFolder && (
          <div className="modal-path" dir="ltr" title={store.diskScanFolder}>
            {store.diskScanFolder}
          </div>
        )}

        {diskScanning && (
          <div className="progress-block">
            <div className="progress-meta">
              <span>{inline(t(S, 'space_phase_scanning'))}</span>
              <span>
                {diskProcessed} · {formatSize(diskBytes)}
              </span>
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

        {diskReport && (
          <div className="space-results">
            <div className="space-summary">
              <div className="stat-pill">
                <span className="stat-num">{diskReport.files_scanned}</span>
                <span className="stat-label">
                  {inline(t(S, 'space_summary_files'))}
                </span>
              </div>
              <div className="stat-pill">
                <span className="stat-num">
                  {formatSize(diskReport.total_bytes)}
                </span>
                <span className="stat-label">
                  {inline(t(S, 'space_summary_total'))}
                </span>
              </div>
            </div>

            {chart.length > 0 && (
              <div className="chart space-chart">
                {chart.map((cat, i) => {
                  const bucket = byCat[cat.id];
                  const pct = totalBytes > 0 ? percent(bucket.bytes, totalBytes) : 0;
                  return (
                    <div className="chart-row" key={cat.id}>
                      <span className="chart-label" title={cat.name}>
                        <span className="chart-icon" aria-hidden="true">
                          {cat.icon}
                        </span>
                        <span className="chart-name">{cat.name}</span>
                        <span className="chart-count">
                          {bucket.files}
                        </span>
                      </span>
                      <div className="chart-track">
                        <div
                          className="chart-fill"
                          style={{
                            width: `${Math.max(pct, bucket.bytes > 0 ? 4 : 0)}%`,
                            background: BAR_COLORS[i % BAR_COLORS.length],
                          }}
                        />
                      </div>
                      <span className="chart-pct">
                        {formatSize(bucket.bytes)} · {pct}%
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="space-top">
              <h3 className="section-title">
                {inline(t(S, 'space_top_heading'))}
              </h3>
              {topFiles.length === 0 ? (
                <div className="chart-empty">{inline(t(S, 'space_top_empty'))}</div>
              ) : (
                <table className="dup-table">
                  <thead>
                    <tr>
                      <th>{inline(t(S, 'space_col_category'))}</th>
                      <th>{inline(t(S, 'space_col_path'))}</th>
                      <th className="num">{inline(t(S, 'space_col_size'))}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topFiles.map((f) => {
                      const name = fileName(f.path);
                      const suffix = name.slice(name.lastIndexOf('.')).toLowerCase();
                      const catRow =
                        categories.find((c) => c.extensions.includes(suffix)) ??
                        categories.find((c) => c.id === 'others');
                      return (
                        <tr key={f.path}>
                          <td>
                            <span
                              className="chart-icon"
                              aria-hidden="true"
                            >
                              {catRow?.icon ?? FileGlyph(name)}
                            </span>
                          </td>
                          <td className="dup-file-cell">
                            <span className="dup-file-name" dir="ltr">
                              {name}
                            </span>
                            <span className="dup-file-dir" dir="ltr">
                              {dirName(f.path)}
                            </span>
                          </td>
                          <td className="num mono">{formatSize(f.size)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
