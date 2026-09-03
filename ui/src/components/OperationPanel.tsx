import { useEffect, useRef } from 'react';

import { useStore, resetApp, runUndo } from '../store';
import type { LogLine } from '../store';
import { fmt, inline, t } from '../i18n';
import { percent } from '../utils';

function LogList({ logs }: { logs: LogLine[] }) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest' });
  }, [logs.length]);

  return (
    <div className="log-list" aria-live="polite">
      {logs.map((line) => (
        <div className={`log-line log-${line.kind}`} key={line.id}>
          {line.text}
        </div>
      ))}
      <div ref={endRef} />
    </div>
  );
}

function Counter({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className={`counter counter-${tone}`}>
      <span className="counter-value">{value}</span>
      <span className="counter-label">{label}</span>
    </div>
  );
}

export default function OperationPanel() {
  const store = useStore();
  const { strings, phase } = store;
  const S = strings;
  const sorting = phase === 'sorting';
  const pct = percent(store.processed, store.totalFiles);
  const result = store.result;

  const confirmUndo = () => {
    const msg = inline(fmt(t(S, 'undo_confirm_msg'), {}));
    if (window.confirm(msg)) {
      void runUndo();
    }
  };

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
            <button type="button" className="btn btn-danger" onClick={confirmUndo}>
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
