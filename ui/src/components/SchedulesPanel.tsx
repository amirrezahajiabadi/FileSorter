import { useState } from 'react';

import type { UIState } from '../store';
import {
  TASK_INTERVALS,
  addScheduledTask,
  closeTasksPanel,
  loadDrives,
  removeScheduledTask,
  runTaskNow,
  taskKindKey,
  taskSummaryArgs,
  taskSummaryKey,
  updateScheduledTask,
} from '../store';
import type { TaskDef, TaskKind } from '../protocol';
import { fmt, inline, t } from '../i18n';

const KIND_ICONS: Record<TaskKind, string> = {
  cleanup: '🧹',
  disk_scan: '📊',
  dup_scan: '🗂',
};

const KIND_ORDER: TaskKind[] = ['cleanup', 'disk_scan', 'dup_scan'];

function needsFolder(kind: TaskKind): boolean {
  return kind !== 'cleanup';
}

function formatWhen(ts: number, lang: string): string {
  if (!ts) return '';
  return new Date(ts * 1000).toLocaleString(lang === 'fa' ? 'fa-IR' : 'en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export default function SchedulesPanel({ store }: { store: UIState }) {
  const S = store.strings;
  const [kind, setKind] = useState<TaskKind>('cleanup');
  const [folder, setFolder] = useState<string | null>(null);
  const [intervalMinutes, setIntervalMinutes] = useState(1440);

  if (!store.tasksOpen) return null;

  // Folder candidates: the currently selected folder, recent folders,
  // and (when loaded) the local drives — a weekly whole-drive scan is
  // the flagship use for scheduled disk_scan/dup_scan.
  const candidates: { label: string; value: string | null }[] = [];
  if (store.folder) candidates.push({ label: store.folder, value: store.folder });
  for (const r of store.recentFolders) {
    if (!candidates.some((c) => c.value === r)) {
      candidates.push({ label: r, value: r });
    }
  }
  for (const d of store.drives) {
    if (!candidates.some((c) => c.value === d.path)) {
      candidates.push({ label: d.path, value: d.path });
    }
  }
  if (!store.drivesLoaded && store.drives.length === 0) {
    void loadDrives();
  }

  const kindLabel = (k: TaskKind) => inline(t(S, taskKindKey(k)));
  const canAdd = !needsFolder(kind) || folder !== null;

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={inline(t(S, 'tasks_title'))}
    >
      <div className="modal modal-wide">
        <div className="modal-head">
          <div>
            <h2 className="modal-title">{inline(t(S, 'tasks_title'))}</h2>
            <p className="modal-sub">{inline(t(S, 'tasks_desc'))}</p>
          </div>
          <button
            type="button"
            className="icon-btn"
            onClick={closeTasksPanel}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="tasks-body">
          {/* ── add form ─────────────────────────────────────── */}
          <section className="tasks-add">
            <h3 className="section-title">{inline(t(S, 'tasks_add_heading'))}</h3>
            <div className="task-kind-row" role="radiogroup" aria-label={inline(t(S, 'task_kind_label'))}>
              {KIND_ORDER.map((k) => (
                <button
                  type="button"
                  key={k}
                  role="radio"
                  aria-checked={kind === k}
                  className={`task-kind-pill ${kind === k ? 'task-kind-pill-on' : ''}`}
                  onClick={() => setKind(k)}
                >
                  <span aria-hidden="true">{KIND_ICONS[k]}</span>
                  {kindLabel(k)}
                </button>
              ))}
            </div>

            {needsFolder(kind) && (
              <div className="task-folder-row">
                <span className="task-field-label">{inline(t(S, 'task_folder_label'))}</span>
                {candidates.length === 0 ? (
                  <p className="task-folder-hint">
                    {inline(t(S, 'space_no_folder'))}
                  </p>
                ) : (
                  <div className="task-folder-chips">
                    {candidates.map((c) => (
                      <button
                        type="button"
                        key={c.value ?? ''}
                        className={`chip-btn ${folder === c.value ? 'chip-btn-on' : ''}`}
                        onClick={() => setFolder(c.value)}
                      >
                        {store.folder === c.value
                          ? `📂 ${inline(t(S, 'task_use_current'))}`
                          : c.label}
                      </button>
                    ))}
                  </div>
                )}
                {folder && (
                  <p className="task-folder-chosen" dir="ltr">
                    {folder}
                  </p>
                )}
              </div>
            )}

            <div className="task-interval-row">
              <label className="task-field-label" htmlFor="task-interval">
                {inline(t(S, 'task_interval_label'))}
              </label>
              <select
                id="task-interval"
                className="input task-interval-select"
                value={intervalMinutes}
                onChange={(e) => setIntervalMinutes(Number(e.target.value))}
              >
                {TASK_INTERVALS.map((it) => (
                  <option key={it.minutes} value={it.minutes}>
                    {inline(t(S, it.key))}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={!canAdd}
                onClick={() => void addScheduledTask(kind, folder, intervalMinutes)}
              >
                {inline(t(S, 'task_add_btn'))}
              </button>
            </div>
          </section>

          {/* ── task list ────────────────────────────────────── */}
          <section className="tasks-list">
            <h3 className="section-title">{inline(t(S, 'tasks_btn'))}</h3>
            {store.tasks.length === 0 ? (
              <p className="dup-none">{inline(t(S, 'tasks_empty'))}</p>
            ) : (
              <div className="task-rows">
                {store.tasks.map((task: TaskDef) => {
                  const running = store.runningTasks.has(task.id);
                  const intervalLabel =
                    TASK_INTERVALS.find((it) => it.minutes === task.interval_minutes)
                      ?.key ?? 'task_interval_1d';
                  return (
                    <div className={`task-row ${task.enabled ? '' : 'task-row-off'}`} key={task.id}>
                      <span className="task-icon" aria-hidden="true">
                        {KIND_ICONS[task.kind]}
                      </span>
                      <div className="task-main">
                        <div className="task-top">
                          <span className="task-name">{kindLabel(task.kind)}</span>
                          {!task.enabled && (
                            <span className="task-off-badge">{inline(t(S, 'task_off'))}</span>
                          )}
                        </div>
                        {task.folder && (
                          <span className="task-folder" dir="ltr">
                            {task.folder}
                          </span>
                        )}
                        <span className="task-when">
                          {task.last_run
                            ? inline(fmt(t(S, 'task_last_run'), { when: formatWhen(task.last_run, store.lang) }))
                            : inline(t(S, 'task_never_run'))}
                          {' · '}
                          {inline(t(S, intervalLabel))}
                        </span>
                      </div>
                      <div className="task-actions">
                        <button
                          type="button"
                          className="task-pause-btn"
                          title={task.enabled ? inline(t(S, 'task_off')) : ''}
                          aria-label="toggle"
                          onClick={() =>
                            void updateScheduledTask(task.id, { enabled: !task.enabled })
                          }
                        >
                          {task.enabled ? '⏸' : '▶️'}
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          disabled={running}
                          onClick={() => void runTaskNow(task.id)}
                        >
                          {running ? (
                            <span className="spinner spinner-sm" aria-hidden="true" />
                          ) : (
                            inline(t(S, 'task_run_now'))
                          )}
                        </button>
                        <button
                          type="button"
                          className="icon-btn task-del-btn"
                          aria-label={inline(t(S, 'task_delete'))}
                          title={inline(t(S, 'task_delete'))}
                          onClick={() => void removeScheduledTask(task.id)}
                        >
                          🗑
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* ── recent runs ──────────────────────────────────── */}
          <section className="tasks-history">
            <h3 className="section-title">{inline(t(S, 'tasks_history_heading'))}</h3>
            {store.tasksHistory.length === 0 ? (
              <p className="dup-none">{inline(t(S, 'tasks_history_empty'))}</p>
            ) : (
              <ul className="task-history-list">
                {store.tasksHistory.map((h, i) => {
                  const task = store.tasks.find((t) => t.id === h.task_id);
                  const label = task
                    ? inline(t(store.strings, taskKindKey(task.kind)))
                    : inline(t(store.strings, taskKindKey(h.kind)));
                  const summary = h.ok
                    ? inline(
                        fmt(t(store.strings, taskSummaryKey(h.kind)), taskSummaryArgs(h)),
                      )
                    : inline(t(store.strings, 'task_failed'));
                  return (
                    <li className={`task-history-item ${h.ok ? '' : 'task-history-fail'}`} key={`${h.task_id}-${i}`}>
                      <span className="task-history-icon" aria-hidden="true">
                        {KIND_ICONS[h.kind]}
                      </span>
                      <span className="task-history-main">
                        <span className="task-history-name">{label}</span>
                        <span className="task-history-summary">{summary}</span>
                      </span>
                      <span className="task-history-time" dir="ltr">
                        {formatWhen(h.at, store.lang)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}