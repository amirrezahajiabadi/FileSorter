import { useMemo } from 'react';

import type { DuplicateMode } from '../protocol';
import {
  useStore,
  closeAnalysis,
  loadPlan,
  runSort,
  setDupMode,
  setMove,
} from '../store';
import { fmt, inline, t } from '../i18n';
import { formatSize } from '../utils';

const DUP_OPTIONS: { value: DuplicateMode; key: string }[] = [
  { value: 'skip', key: 'duplicate_mode_skip' },
  { value: 'rename', key: 'duplicate_mode_rename' },
  { value: 'overwrite', key: 'duplicate_mode_overwrite' },
];

const BAR_COLORS = [
  '#7c73ff',
  '#3b82f6',
  '#00d4aa',
  '#f59e0b',
  '#f87171',
  '#8b5cf6',
  '#60a5fa',
];

function resultLabel(strings: Record<string, string>, action: string, finalName: string): string {
  const S = strings;
  switch (action) {
    case 'ok':
      return inline(t(S, 'dry_run_action_ok'));
    case 'skip':
      return inline(t(S, 'dry_run_action_skip'));
    case 'rename':
      return inline(fmt(t(S, 'dry_run_action_rename'), { final_name: finalName }));
    case 'overwrite':
      return inline(t(S, 'dry_run_action_overwrite'));
    default:
      return action;
  }
}

export default function AnalysisModal() {
  const store = useStore();
  const { strings, report, phase, categories, folder } = store;
  const S = strings;
  const byCat = report?.by_category ?? {};
  const chart = useMemo(
    () =>
      categories
        .filter((c) => (byCat[c.id] ?? 0) > 0)
        .sort((a, b) => byCat[b.id] - byCat[a.id]),
    [categories, byCat],
  );
  const total = report?.total || 0;

  const suggestions = useMemo(() => {
    const list: { kind: string; text: string }[] = [];
    if (report && (report.large_files ?? []).length > 0) {
      list.push({
        kind: 'warning',
        text: inline(fmt(t(S, 'suggestion_large'), { n: report.large_files.length })),
      });
    }
    if (report && (report.old_files ?? []).length > 0) {
      list.push({
        kind: 'info',
        text: inline(fmt(t(S, 'suggestion_old'), { n: report.old_files.length })),
      });
    }
    const unknown = report?.unknown_extensions ?? [];
    if (unknown.length > 0) {
      list.push({
        kind: 'error',
        text: inline(
          fmt(t(S, 'suggestion_unknown'), { exts: unknown.slice(0, 5).join(', ') }),
        ),
      });
    }
    const othersCount = byCat.others ?? 0;
    if (othersCount > 5) {
      list.push({ kind: 'info', text: inline(fmt(t(S, 'suggestion_others'), { n: othersCount })) });
    }
    if (list.length === 0) {
      list.push({ kind: 'info', text: inline(t(S, 'no_issues')) });
    }
    return list;
  }, [report, byCat, S]);

  if (phase !== 'analysis' || !report) return null;

  const openPlan = async () => {
    await loadPlan(store.dupMode);
  };

  const proceed = () => {
    const move = store.move;
    if (move && !window.confirm(fmt(t(S, 'move_confirm_msg'), { total }))) {
      return;
    }
    void runSort();
  };

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label={inline(t(S, 'analysis_header'))}>
      <div className="modal">
        <div className="modal-head">
          <div>
            <h2 className="modal-title">{inline(t(S, 'analysis_header'))}</h2>
            <p className="modal-sub">{inline(t(S, 'analysis_subheader'))}</p>
          </div>
          <button type="button" className="icon-btn" onClick={closeAnalysis} aria-label="Close">
            ✕
          </button>
        </div>

        {folder && (
          <div className="modal-path" dir="ltr" title={folder}>
            {folder}
          </div>
        )}

        <div className="stats-row">
          <div className="stat">
            <span className="stat-value">{total}</span>
            <span className="stat-label">{inline(t(S, 'total_files'))}</span>
          </div>
          <div className="stat">
            <span className="stat-value">{formatSize(report.total_size || 0)}</span>
            <span className="stat-label">{inline(t(S, 'total_size'))}</span>
          </div>
          <div className="stat">
            <span className="stat-value">{(report.large_files ?? []).length}</span>
            <span className="stat-label">{inline(t(S, 'large_files'))}</span>
          </div>
          <div className="stat">
            <span className="stat-value">{(report.old_files ?? []).length}</span>
            <span className="stat-label">{inline(t(S, 'old_files'))}</span>
          </div>
        </div>

        <div className="modal-section">
          <h3 className="modal-section-title">{inline(t(S, 'files_by_category'))}</h3>
          <div className="chart">
            {chart.map((cat, i) => {
              const count = byCat[cat.id] ?? 0;
              const pct = total > 0 ? Math.round((count / total) * 100) : 0;
              return (
                <div className="chart-row" key={cat.id}>
                  <span className="chart-label" title={cat.name}>
                    <span className="chart-icon" aria-hidden="true">{cat.icon}</span>
                    <span className="chart-name">{cat.name}</span>
                    <span className="chart-count">{count}</span>
                  </span>
                  <div className="chart-track">
                    <div
                      className="chart-fill"
                      style={{
                        width: `${Math.max(pct, count > 0 ? 4 : 0)}%`,
                        background: BAR_COLORS[i % BAR_COLORS.length],
                      }}
                    />
                  </div>
                  <span className="chart-pct">{pct}%</span>
                </div>
              );
            })}
            {chart.length === 0 && (
              <div className="chart-empty">{inline(t(S, 'dry_run_empty'))}</div>
            )}
          </div>
        </div>

        <div className="modal-section">
          <h3 className="modal-section-title">{inline(t(S, 'smart_suggestions'))}</h3>
          {suggestions.map((sg, i) => (
            <div className={`suggestion suggestion-${sg.kind}`} key={i}>
              {sg.text}
            </div>
          ))}
        </div>

        <div className="modal-section options">
          <label className="check-row">
            <input
              type="checkbox"
              checked={store.move}
              onChange={(e) => setMove(e.target.checked)}
            />
            <span>{inline(t(S, 'move_checkbox_label'))}</span>
          </label>
          {store.move && <div className="warning-note">{inline(t(S, 'move_warning'))}</div>}

          <div className="dup-block">
            <span className="dup-label">{inline(t(S, 'duplicate_mode_label'))}</span>
            <div className="radio-row">
              {DUP_OPTIONS.map((opt) => (
                <label className="radio" key={opt.value}>
                  <input
                    type="radio"
                    name="dupMode"
                    value={opt.value}
                    checked={store.dupMode === opt.value}
                    onChange={() => setDupMode(opt.value)}
                  />
                  <span>{inline(t(S, opt.key))}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        {store.dryRunOpen && store.plan && (
          <div className="modal-section dry-run">
            <h3 className="modal-section-title">{inline(t(S, 'dry_run_header'))}</h3>
            <div className="plan-table">
              {store.plan.map((item, i) => {
                const cat = categories.find((c) => c.id === item.category);
                return (
                  <div className="plan-row" key={i}>
                    <span className="plan-file" dir="ltr">
                      {item.name}
                    </span>
                    <span className="plan-cat">
                      {cat?.icon} {cat?.name ?? item.category}
                    </span>
                    <span className="plan-result">
                      {resultLabel(S, item.action, item.final_name)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="modal-foot">
          <button type="button" className="btn btn-ghost" onClick={closeAnalysis}>
            {inline(t(S, 'cancel_btn'))}
          </button>
          {!store.dryRunOpen && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => void openPlan()}
            >
              {inline(t(S, 'dry_run_btn'))}
            </button>
          )}
          {store.dryRunOpen && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={closeAnalysis}
            >
              {inline(t(S, 'dry_run_close_btn'))}
            </button>
          )}
          <button type="button" className="btn btn-primary" onClick={proceed}>
            {inline(t(S, 'proceed_btn'))}
          </button>
        </div>
      </div>
    </div>
  );
}
