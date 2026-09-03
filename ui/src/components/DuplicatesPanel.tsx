import { useState } from 'react';

import type { UIState } from '../store';
import {
  closeDupPanel,
  deleteSelectedDupes,
  dupScanBrowse,
  dupScanCurrent,
  toggleDupFile,
} from '../store';
import { fmt, inline, t } from '../i18n';
import { formatSize, percent } from '../utils';

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

export default function DuplicatesPanel({ store }: { store: UIState }) {
  const S = store.strings;
  const [armed, setArmed] = useState(false);

  if (!store.dupOpen) return null;

  const { dupGroups, dupScanning, dupPhase, dupProcessed, dupTotal } = store;
  const extraCopies = dupGroups.reduce(
    (n, g) => n + g.files.filter((f) => f.markDelete).length,
    0,
  );
  const reclaimable = dupGroups.reduce(
    (n, g) =>
      n + g.files.filter((f) => f.markDelete).reduce((s, f) => s + f.size, 0),
    0,
  );
  const phaseLabel =
    dupPhase === 'hashing'
      ? inline(t(S, 'dup_phase_hashing'))
      : inline(t(S, 'dup_phase_listing'));

  const doDelete = async () => {
    await deleteSelectedDupes();
    setArmed(false);
  };

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={inline(t(S, 'dup_title'))}
    >
      <div className="modal modal-wide">
        <div className="modal-head">
          <div>
            <h2 className="modal-title">{inline(t(S, 'dup_title'))}</h2>
            <p className="modal-sub">{inline(t(S, 'dup_desc'))}</p>
          </div>
          <button type="button" className="icon-btn" onClick={closeDupPanel} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="dup-actions">
          {store.folder && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => void dupScanCurrent()}
            >
              {inline(t(S, 'dup_scan_current'))}
            </button>
          )}
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => void dupScanBrowse()}
          >
            {inline(t(S, 'dup_scan_browse'))}
          </button>
        </div>

        {store.dupScanFolder && (
          <div className="modal-path" dir="ltr" title={store.dupScanFolder}>
            {store.dupScanFolder}
          </div>
        )}

        {dupScanning ? (
          <div className="progress-block">
            <div className="progress-meta">
              <span>{phaseLabel}</span>
              {dupPhase === 'hashing' && dupTotal > 0 && (
                <span>
                  {dupProcessed} / {dupTotal} ({percent(dupProcessed, dupTotal)}%)
                </span>
              )}
            </div>
            <div className="progress-track">
              <div
                className="progress-fill"
                style={{
                  width:
                    dupPhase === 'hashing' && dupTotal > 0
                      ? `${percent(dupProcessed, dupTotal)}%`
                      : '100%',
                  animation:
                    dupPhase === 'listing'
                      ? 'dup-pulse 1.2s ease-in-out infinite'
                      : undefined,
                }}
              />
            </div>
          </div>
        ) : dupGroups.length === 0 ? (
          <p className="dup-none">
            {store.dupScanFolder
              ? inline(t(S, 'dup_none_found'))
              : inline(t(S, 'dup_no_folder'))}
          </p>
        ) : (
          <div className="dup-results">
            <div className="dup-summary">
              <span className="dup-summary-item">
                {inline(fmt(t(S, 'dup_summary_groups'), { n: dupGroups.length }))}
              </span>
              <span className="dup-summary-item">
                {inline(fmt(t(S, 'dup_summary_copies'), { n: extraCopies }))}
              </span>
              {reclaimable > 0 && (
                <span className="dup-summary-item dup-summary-reclaim">
                  {inline(fmt(t(S, 'dup_reclaim'), { size: formatSize(reclaimable) }))}
                </span>
              )}
            </div>
            <p className="dup-hint">{inline(t(S, 'dup_hint'))}</p>

            <div className="dup-groups">
              {dupGroups.map((group, gi) => (
                <section className="dup-group" key={group.id}>
                  <header className="dup-group-head">
                    <span className="dup-group-num">#{gi + 1}</span>
                    <span className="dup-group-meta">
                      {formatSize(group.size)} × {group.files.length}
                    </span>
                  </header>
                  <ul className="dup-files">
                    {group.files.map((f) => {
                      const name = fileName(f.path);
                      const keepers = group.files.filter((x) => !x.markDelete);
                      const isLastKeeper = !f.markDelete && keepers.length === 1;
                      return (
                        <li className="dup-file" key={f.path}>
                          <label
                            className={`dup-file-main ${f.markDelete ? 'is-del' : 'is-keep'}${isLastKeeper ? ' is-locked' : ''}`}
                            title={
                              isLastKeeper ? inline(t(S, 'dup_keep_label')) : undefined
                            }
                          >
                            <input
                              type="checkbox"
                              checked={f.markDelete}
                              disabled={isLastKeeper}
                              onChange={() => toggleDupFile(group.id, f.path)}
                            />
                            <span className="dup-glyph" aria-hidden="true">
                              {FileGlyph(name)}
                            </span>
                            <span className="dup-name" dir="ltr">
                              {name}
                            </span>
                          </label>
                          <span className="dup-file-dir" dir="ltr" title={f.path}>
                            {f.path}
                          </span>
                          <span className="dup-size">{formatSize(f.size)}</span>
                          <span
                            className={`dup-tag ${f.markDelete ? 'dup-tag-del' : 'dup-tag-keep'}`}
                          >
                            {inline(t(S, f.markDelete ? 'dup_delete_label' : 'dup_keep_label'))}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </div>

            <div className="modal-foot dup-foot">
              <p className="dup-arm-note" aria-live="polite">
                {armed ? inline(t(S, 'dup_confirm_note')) : ''}
              </p>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setArmed(false);
                  closeDupPanel();
                }}
              >
                {inline(t(S, 'cancel_btn'))}
              </button>
              <button
                type="button"
                className={`btn ${armed ? 'btn-danger' : 'btn-danger-outline'}`}
                disabled={extraCopies === 0}
                onClick={() => (armed ? void doDelete() : setArmed(true))}
              >
                {armed
                  ? inline(t(S, 'dup_confirm_arm'))
                  : inline(fmt(t(S, 'dup_delete_selected'), { n: extraCopies }))}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
