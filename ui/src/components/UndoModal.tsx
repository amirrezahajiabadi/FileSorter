import { useMemo } from 'react';

import type { SortLogEntry } from '../protocol';
import { closeUndoModal, runUndo, useStore } from '../store';
import { fmt, inline, t } from '../i18n';

interface Group {
  category: string;
  icon: string;
  name: string;
  files: string[];
}

export default function UndoModal() {
  const store = useStore();
  const result = store.result;
  const S = store.strings;

  const groups = useMemo<Group[]>(() => {
    if (!store.undoOpen || !result || result.kind !== 'sort') return [];
    const byCat = new Map<string, SortLogEntry[]>();
    for (const entry of result.sort_log) {
      const cat = entry.category || 'others';
      const list = byCat.get(cat) ?? [];
      list.push(entry);
      byCat.set(cat, list);
    }
    const out: Group[] = [];
    for (const [catId, entries] of byCat) {
      const row = store.categories.find((c) => c.id === catId);
      out.push({
        category: catId,
        icon: row?.icon ?? '📁',
        name: row?.name ?? catId,
        files: entries.map((e) => e.name || e.final_dest.split(/[\/]/).pop() || '?'),
      });
    }
    return out.sort((a, b) => a.category.localeCompare(b.category));
  }, [store.undoOpen, store.categories, result]);

  if (!store.undoOpen || !result || result.kind !== 'sort') return null;

  const totalFiles = result.sort_log.length;

  const confirmUndo = () => {
    void runUndo(); // modal closes itself when phase leaves 'done'
  };

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={inline(t(S, 'undo_confirm_title'))}
    >
      <div className="modal modal-narrow">
        <div className="modal-head">
          <div>
            <h2 className="modal-title">{inline(t(S, 'undo_confirm_title'))}</h2>
            <p className="modal-sub">{inline(t(S, 'undo_confirm_msg'))}</p>
          </div>
          <button
            type="button"
            className="icon-btn"
            onClick={closeUndoModal}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="undo-summary">
          {inline(
            fmt(t(S, 'files_count_suffix'), { count: totalFiles }),
          )}{' '}
          <span className="mono" dir="ltr">
            {store.folder}
          </span>
        </div>

        <div className="undo-groups">
          {groups.map((g) => (
            <div className="undo-group" key={g.category}>
              <div className="undo-group-head">
                <span aria-hidden="true">{g.icon}</span>
                <span className="undo-group-name">{g.name}</span>
                <span className="undo-group-count">{g.files.length}</span>
              </div>
              <div className="undo-group-files">
                {g.files.map((name) => (
                  <div className="undo-file" key={name} dir="ltr">
                    {name}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="modal-foot">
          <button type="button" className="btn btn-ghost" onClick={closeUndoModal}>
            {inline(t(S, 'cancel_btn'))}
          </button>
          <button type="button" className="btn btn-danger" onClick={confirmUndo}>
            {inline(t(S, 'undo_btn'))}
          </button>
        </div>
      </div>
    </div>
  );
}
