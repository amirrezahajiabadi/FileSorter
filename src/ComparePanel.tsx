import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { CompareFile, CompareReport, CompareRequest, DroppedPaths } from "./types";
import { fmt, getStrings, type Locale } from "./i18n";

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = n;
  let i = -1;
  do {
    v /= 1024;
    i++;
  } while (v >= 1024 && i < units.length - 1);
  return `${v.toFixed(v >= 100 ? 0 : 1)} ${units[i]}`;
}

/** Lists can hold thousands of paths; the table renders a readable slice. */
const VISIBLE_ROWS = 300;

function RelTable({
  title,
  rows,
  leftLabel,
  rightLabel,
  emptyLabel,
}: {
  title: string;
  rows: { rel: string; left?: string; right?: string }[];
  leftLabel: string;
  rightLabel: string;
  emptyLabel: string;
}) {
  return (
    <div style={{ marginTop: "18px" }}>
      <h2 style={{ fontSize: "15px", marginBottom: "8px" }}>
        {title} <span className="badge-tag">{rows.length}</span>
      </h2>
      {rows.length === 0 ? (
        <p className="panel-note">{emptyLabel}</p>
      ) : (
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>{leftLabel}</th>
                <th>{rightLabel}</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, VISIBLE_ROWS).map((row, i) => (
                <tr key={`${row.rel}-${i}`}>
                  <td className="mono ellipsis" title={row.rel}>
                    {row.rel}
                  </td>
                  <td className="mono ellipsis" title={row.right ?? ""}>
                    {row.right ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {rows.length > VISIBLE_ROWS && <p className="panel-note">+{rows.length - VISIBLE_ROWS}</p>}
    </div>
  );
}

export default function ComparePanel({ lang, dropped }: { lang: Locale; dropped?: DroppedPaths | null }) {
  const t = getStrings(lang);
  const isRtl = lang === "fa";
  const fmtNum = (n: number) => n.toLocaleString(isRtl ? "fa-IR" : "en-US");

  const [left, setLeft] = useState("");
  const [right, setRight] = useState("");
  const [includeHidden, setIncludeHidden] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ side: string; done: number } | null>(null);
  const [report, setReport] = useState<CompareReport | null>(null);
  const [error, setError] = useState("");

  // A dropped folder fills the first empty side, then the other one, so two
  // drops in a row set up a comparison without touching the pickers.
  const lastDrop = useRef(dropped?.seq ?? 0);
  useEffect(() => {
    if (!dropped || dropped.seq === lastDrop.current) return;
    lastDrop.current = dropped.seq;
    const folder = dropped.paths[0];
    if (!folder) return;
    if (!left) setLeft(folder);
    else if (!right || right === left) setRight(folder);
    else setLeft(folder);
    setReport(null);
    setError("");
  }, [dropped, left, right]);

  useEffect(() => {
    let unlisten: UnlistenFn | null = null;
    let active = true;
    void listen<{ side: string; done: number }>("compare-progress", (event) => {
      if (active) setProgress(event.payload);
    }).then((fn) => {
      if (active) unlisten = fn;
      else fn();
    });
    return () => {
      active = false;
      if (unlisten) unlisten();
    };
  }, []);

  const pick = async (side: "left" | "right") => {
    try {
      const picked = await invoke<string | null>("pick_folder");
      if (!picked) return;
      if (side === "left") setLeft(picked);
      else setRight(picked);
      setReport(null);
      setError("");
    } catch (e) {
      setError(String(e));
    }
  };

  const run = async () => {
    if (!left || !right || busy) return;
    setBusy(true);
    setError("");
    setProgress(null);
    const req: CompareRequest = { left, right, include_hidden: includeHidden };
    try {
      setReport(await invoke<CompareReport>("compare_folders", { req }));
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const sideLabel = (side: string) => (side === "left" ? t.cmp_side_left : t.cmp_side_right);
  const asRows = (files: CompareFile[]) => files.map((f) => ({ rel: f.rel, right: formatBytes(f.size) }));
  const isMatch =
    report !== null &&
    report.changed_count === 0 &&
    report.only_left_count === 0 &&
    report.only_right_count === 0 &&
    report.moved_count === 0;

  return (
    <div className="tool-page">
      <section className="glass">
        <div className="dupes-header">
          <div>
            <h1>{t.cmp_title}</h1>
            <p>{t.cmp_desc}</p>
          </div>
          <div className="summary-actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void run()}
              disabled={busy || !left || !right}
            >
              {busy ? t.cmp_running : t.cmp_run}
            </button>
          </div>
        </div>

        <div className="form-grid">
          <div className="field">
            <label>{t.cmp_left}</label>
            <div style={{ display: "flex", gap: "8px" }}>
              <input type="text" readOnly value={left} placeholder={t.cmp_pick} title={left} style={{ flex: 1, minWidth: 0 }} />
              <button type="button" className="btn btn-ghost" onClick={() => void pick("left")} disabled={busy}>
                {t.cmp_pick}
              </button>
            </div>
          </div>
          <div className="field">
            <label>{t.cmp_right}</label>
            <div style={{ display: "flex", gap: "8px" }}>
              <input type="text" readOnly value={right} placeholder={t.cmp_pick} title={right} style={{ flex: 1, minWidth: 0 }} />
              <button type="button" className="btn btn-ghost" onClick={() => void pick("right")} disabled={busy}>
                {t.cmp_pick}
              </button>
            </div>
          </div>
        </div>

        <div className="check-row" style={{ marginTop: "14px" }}>
          <label>
            <input type="checkbox" checked={includeHidden} onChange={(e) => setIncludeHidden(e.target.checked)} />
            {t.cmp_hidden}
          </label>
        </div>
      </section>

      {error && (
        <div className="error-bar" role="alert" onClick={() => setError("")}>
          <span>{error}</span>
          <span style={{ cursor: "pointer" }}>×</span>
        </div>
      )}

      {busy && (
        <p className="panel-note">
          {progress ? fmt(t.cmp_running_side, { side: sideLabel(progress.side), count: fmtNum(progress.done) }) : t.cmp_running}
        </p>
      )}

      {report && !busy && (
        <section className="glass">
          <div className="dupes-toolbar" style={{ marginBottom: "14px" }}>
            <span className="ellipsis" title={report.left.path}>
              {fmt(t.cmp_files, { count: fmtNum(report.left.files) })} · {formatBytes(report.left.bytes)}
            </span>
            <span className="muted">{fmt(t.cmp_elapsed, { ms: fmtNum(report.elapsed_ms) })}</span>
            <span className="ellipsis" title={report.right.path}>
              {fmt(t.cmp_files, { count: fmtNum(report.right.files) })} · {formatBytes(report.right.bytes)}
            </span>
          </div>

          <div className="summary">
            <div className="stat">
              <b>{fmtNum(report.identical)}</b>
              <span>{t.cmp_identical}</span>
            </div>
            <div className="stat">
              <b>{fmtNum(report.changed_count)}</b>
              <span>{t.cmp_changed}</span>
            </div>
            <div className="stat">
              <b>{fmtNum(report.only_left_count)}</b>
              <span>{t.cmp_only_left}</span>
            </div>
            <div className="stat">
              <b>{fmtNum(report.only_right_count)}</b>
              <span>{t.cmp_only_right}</span>
            </div>
            <div className="stat">
              <b>{fmtNum(report.moved_count)}</b>
              <span>{t.cmp_moved}</span>
            </div>
          </div>

          {report.truncated && <p className="panel-note">{t.cmp_truncated}</p>}

          {isMatch && <p className="panel-note">{t.cmp_match}</p>}

          <RelTable
            title={t.cmp_changed}
            rows={report.changed.map((p) => ({
              rel: p.rel,
              right: `${formatBytes(p.left_size)} → ${formatBytes(p.right_size)}`,
            }))}
            leftLabel={t.cmp_col_rel}
            rightLabel={`${t.cmp_col_left} → ${t.cmp_col_right}`}
            emptyLabel="—"
          />
          <RelTable
            title={t.cmp_moved}
            rows={report.moved.map((m) => ({ rel: m.left_rel, right: `${m.right_rel} · ${formatBytes(m.size)}` }))}
            leftLabel={t.cmp_col_left}
            rightLabel={t.cmp_col_right}
            emptyLabel="—"
          />
          <RelTable
            title={t.cmp_only_left}
            rows={asRows(report.only_left)}
            leftLabel={t.cmp_col_rel}
            rightLabel={t.gs_col_size}
            emptyLabel="—"
          />
          <RelTable
            title={t.cmp_only_right}
            rows={asRows(report.only_right)}
            leftLabel={t.cmp_col_rel}
            rightLabel={t.gs_col_size}
            emptyLabel="—"
          />
        </section>
      )}

      {!report && !busy && (
        <div className="empty-state">
          <h2>{t.cmp_empty_title}</h2>
          <p>{t.cmp_empty_body}</p>
        </div>
      )}
    </div>
  );
}
