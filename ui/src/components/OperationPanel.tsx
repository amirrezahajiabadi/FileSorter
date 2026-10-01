import { useEffect, useRef, memo } from 'react';

import { openUndoModal, resetApp, useStoreFields } from '../store';
import type { LogLine } from '../store';
import { fmt, inline, t } from '../i18n';
import { percent } from '../utils';

// One memoized row per log line. The list itself gets a new array every batch,
// but the LogLine objects inside it are reused, so memo keeps React from
// touching the ~250 rows already on screen — only the new tail row renders.
const LogRow = memo(function LogRow({ line }: { line: LogLine }) {
  return <div className={`log-line log-${line.kind}`}>{line.text}</div>;
});

const LogList = memo(function LogList({ logs }: { logs: LogLine[] }) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Only auto-scroll if the reader is already at the bottom. Scroll by
    // assigning scrollTop rather than scrollIntoView: a sort emits batches
    // several times a second, and scrollIntoView re-runs layout for the whole
    // list each time, which is what made the live log feel janky.
    const container = listRef.current;
    if (!container) return;
    const threshold = 60; // pixels from bottom
    const distance =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    if (distance < threshold) {
      container.scrollTop = container.scrollHeight;
    }
  }, [logs.length]);

  if (logs.length === 0) return null;

  return (
    <div className="log-list" aria-live="polite" ref={listRef}>
      {logs.map((line) => (
        <LogRow key={line.id} line={line} />
      ))}
    </div>
  );
});

const Counter = memo(function Counter({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className={`counter counter-${tone}`}>
      <span className="counter-value">{value}</span>
      <span className="counter-label">{label}</span>
    </div>
  );
});

export default function OperationPanel() {
  const store = useStoreFields([
    'strings',
    'phase',
    'result',
    'logs',
    'folder',
    'processed',
    'totalFiles',
    'okCount',
    'skipCount',
    'errorCount',
  ]);
  const { strings, phase } = store;
  const S = strings;
  const sorting = phase === 'sorting';
  const result = store.result;

  // Only compute progress when actually sorting
  const pct = sorting ? percent(store.processed, store.totalFiles) : 0;

  return (
    <section className="op-panel" aria-label="Operation">
      {sorting && (
        <>
          <div className="op-heading">
            <span className="spinner spinner-sm" aria-hidden="true" />
            <span className="op-title">{inline(t(S, 'sorting_btn'))}</span>
          </div>

          <div className="progress-block">
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${pct}%` }} />
            </div>
            <div className="progress-meta">
              <span>
                {inline(
                  fmt(t(S, 'progress_status'), {
                    done: store.processed,
                    total: store.totalFiles,
                    percent: pct,
                  }),
                )}
              </span>
              <span className="mono" dir="ltr">
                {store.folder}
              </span>
            </div>
          </div>

          <div className="counters">
            <Counter
              label={inline(t(S, 'copied_label'))}
              value={store.okCount}
              tone="ok"
            />
            <Counter
              label={inline(t(S, 'skipped_label'))}
              value={store.skipCount}
              tone="skip"
            />
            <Counter
              label={inline(t(S, 'errors_label'))}
              value={store.errorCount}
              tone="err"
            />
          </div>
        </>
      )}

      {!sorting && result && result.kind === 'sort' && (
        <>
          <div className="op-heading op-success">
            <span className="op-icon" aria-hidden="true">
              🎉
            </span>
            <span className="op-title">{inline(t(S, 'done_log_title'))}</span>
          </div>

          <div className="counters">
            <Counter
              label={inline(t(S, 'copied_label'))}
              value={result.copied}
              tone="ok"
            />
            <Counter
              label={inline(t(S, 'skipped_label'))}
              value={result.skipped}
              tone="skip"
            />
            <Counter
              label={inline(t(S, 'errors_label'))}
              value={result.errors}
              tone="err"
            />
          </div>

          <div className="op-dir">
            <span className="op-dir-label">{inline(t(S, 'output_dir_label'))}</span>
            <span className="mono op-dir-path" dir="ltr">
              {result.target_dir}
            </span>
          </div>

          <div className="op-actions">
            <button type="button" className="btn btn-danger" onClick={openUndoModal}>
              {inline(t(S, 'undo_btn'))}
            </button>
            <button type="button" className="btn btn-ghost" onClick={resetApp}>
              {inline(t(S, 'start_over_btn'))}
            </button>
          </div>
        </>
      )}

      {store.logs.length > 0 && <LogList logs={store.logs} />}
    </section>
  );
}
