import { useState } from 'react';

import type { UIState } from '../store';
import { analyzeFolder, browseFolder, pickRecent } from '../store';
import { inline, t } from '../i18n';

function FolderIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </svg>
  );
}

export default function FolderPicker({ store }: { store: UIState }) {
  const { strings, folder, recentFolders, phase } = store;
  const browseLabel = t(strings, 'browse_btn');
  const recentLabel = t(strings, 'recent_folders_btn');
  const noFolder = t(strings, 'no_folder');
  const selectedLabel = t(strings, 'selected_folder_label');
  const recentEmpty = t(strings, 'recent_folders_empty');
  const typedPlaceholder = t(strings, 'picker_typed_placeholder');
  const typedGo = t(strings, 'picker_typed_go');
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState('');

  const submitTyped = (raw: string) => {
    const path = raw.trim();
    if (!path) return;
    pickRecent(path);
    setTyping(false);
    setDraft('');
  };

  const handleBrowse = async () => {
    if (phase === 'analyzing') return;
    // Headless transports have no native dialog (returns null); desktop
    // users can cancel. Both fall back to a typed path so every mode can
    // pick any folder, not just the recent list (v6.1.2).
    const picked = await browseFolder();
    if (!picked) {
      setDraft(folder ?? '');
      setTyping(true);
    }
  };

  return (
    <section className="picker" aria-label="Folder selection">
      <div className={`picker-card ${folder ? 'picker-card-filled' : ''}`}>
        <div className="picker-icon">
          <FolderIcon />
        </div>
        <div className="picker-info">
          <span className="picker-label">{folder ? selectedLabel : noFolder}</span>
          <span className="picker-path" title={folder ?? undefined}>
            {folder ?? noFolder}
          </span>
        </div>
        <div className="picker-actions">
          {folder && phase === 'idle' && (
            <button
              type="button"
              className="btn btn-accent"
              onClick={() => void analyzeFolder()}
            >
              {t(strings, 'analyze_btn')}
            </button>
          )}
          <button
            type="button"
            className="btn btn-primary"
            disabled={phase === 'analyzing'}
            onClick={() => void handleBrowse()}
          >
            {browseLabel}
          </button>
        </div>
      </div>

      {typing && (
        <form
          className="picker-typed"
          onSubmit={(e) => {
            e.preventDefault();
            submitTyped(draft);
          }}
        >
          <input
            className="picker-typed-input"
            type="text"
            dir="ltr"
            value={draft}
            placeholder={inline(typedPlaceholder)}
            onChange={(e) => setDraft(e.target.value)}
            autoFocus
          />
          <button type="submit" className="btn btn-secondary btn-sm">
            {inline(typedGo)}
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              setTyping(false);
              setDraft('');
            }}
          >
            ✕
          </button>
        </form>
      )}

      {phase === 'analyzing' && (
        <div className="analyzing-note">
          <span className="spinner spinner-sm" aria-hidden="true" />
          <span>{t(strings, 'analyzing_btn')}</span>
        </div>
      )}

      {recentFolders.length > 0 && (
        <div className="recent-row">
          <span className="recent-title" aria-hidden="true">{recentLabel}</span>
          {recentFolders.map((path) => (
            <button
              key={path}
              type="button"
              className="recent-chip"
              title={path}
              onClick={() => pickRecent(path)}
            >
              {path}
            </button>
          ))}
        </div>
      )}
      {recentFolders.length === 0 && store.ready && (
        <div className="recent-empty">{recentEmpty}</div>
      )}
    </section>
  );
}
