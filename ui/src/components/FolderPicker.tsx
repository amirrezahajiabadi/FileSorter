import type { UIState } from '../store';
import { browseFolder, pickRecent } from '../store';
import { t } from '../i18n';

function FolderIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </svg>
  );
}

export default function FolderPicker({ store }: { store: UIState }) {
  const { strings, folder, recentFolders } = store;
  const browseLabel = t(strings, 'browse_btn');
  const recentLabel = t(strings, 'recent_folders_btn');
  const noFolder = t(strings, 'no_folder');
  const selectedLabel = t(strings, 'selected_folder_label');
  const recentEmpty = t(strings, 'recent_folders_empty');

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
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => void browseFolder()}
        >
          {browseLabel}
        </button>
      </div>

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
