import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { DroppedPaths, SearchMode, SearchReport, SearchRequest } from "./types";
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

/** Empty input means "no bound"; the backend receives bytes, the UI speaks MB. */
function mbToBytes(raw: string): number | null {
  const value = Number(raw.replace(",", "."));
  if (!raw.trim() || !Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 1024 * 1024);
}

export default function SearchPanel({
  lang,
  dropped,
  onSend,
}: {
  lang: Locale;
  dropped?: DroppedPaths | null;
  /** Hands the ticked results to another tab: zip them, or rename them. */
  onSend?: (tab: "archive" | "renamer", paths: string[]) => void;
}) {
  const t = getStrings(lang);
  const isRtl = lang === "fa";
  const fmtNum = (n: number) => n.toLocaleString(isRtl ? "fa-IR" : "en-US");

  const [root, setRoot] = useState("");
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<SearchMode>("contains");
  const [extensions, setExtensions] = useState("");
  const [minMb, setMinMb] = useState("");
  const [maxMb, setMaxMb] = useState("");
  const [includeHidden, setIncludeHidden] = useState(false);
  const [caseSensitive, setCaseSensitive] = useState(false);

  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<SearchReport | null>(null);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<string[]>([]);

  // A drop on this tab means "search here"; `seq` keeps a re-mount from
  // re-applying an older drop.
  const lastDrop = useRef(dropped?.seq ?? 0);
  useEffect(() => {
    if (!dropped || dropped.seq === lastDrop.current) return;
    lastDrop.current = dropped.seq;
    const folder = dropped.paths[0];
    if (folder) {
      setRoot(folder);
      setReport(null);
      setError("");
    }
  }, [dropped]);

  const pickRoot = async () => {
    try {
      const picked = await invoke<string | null>("pick_folder");
      if (picked) {
        setRoot(picked);
        setReport(null);
        setError("");
      }
    } catch (e) {
      setError(String(e));
    }
  };

  const run = async () => {
    if (!root || busy) return;
    setBusy(true);
    setError("");
    const req: SearchRequest = {
      root,
      query,
      mode,
      extensions: extensions
        .split(/[,\s]+/)
        .map((x) => x.trim())
        .filter(Boolean),
      min_bytes: mbToBytes(minMb),
      max_bytes: mbToBytes(maxMb),
      include_hidden: includeHidden,
      case_sensitive: caseSensitive,
    };
    try {
      setReport(await invoke<SearchReport>("search_files", { req }));
      setSelected([]);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const stop = () => {
    void invoke("stop_search");
  };

  const toggle = (path: string) =>
    setSelected((prev) => (prev.includes(path) ? prev.filter((p) => p !== path) : [...prev, path]));

  const allSelected = !!report && report.hits.length > 0 && selected.length === report.hits.length;

  const toggleAll = () =>
    setSelected((prev) =>
      report && prev.length === report.hits.length ? [] : (report?.hits.map((h) => h.path) ?? []),
    );

  const reveal = (folder: string) => {
    void invoke("open_in_file_manager", { path: folder });
  };

  return (
    <div className="tool-page">
      <section className="glass">
        <div className="dupes-header">
          <div>
            <h1>{t.gs_title}</h1>
            <p>{t.gs_desc}</p>
          </div>
          <div className="summary-actions">
            {busy && (
              <button type="button" className="btn btn-ghost" onClick={stop}>
                {t.gs_stop}
              </button>
            )}
            <button type="button" className="btn btn-primary" onClick={() => void run()} disabled={busy || !root}>
              {busy ? t.gs_running : t.gs_run}
            </button>
          </div>
        </div>

        <div className="form-grid">
          <div className="field">
            <label>{t.gs_root}</label>
            <div style={{ display: "flex", gap: "8px" }}>
              <input
                type="text"
                readOnly
                value={root}
                placeholder={t.gs_root_ph}
                title={root}
                style={{ flex: 1, minWidth: 0 }}
              />
              <button type="button" className="btn btn-ghost" onClick={() => void pickRoot()} disabled={busy}>
                {t.cmp_pick}
              </button>
            </div>
          </div>
          <div className="field">
            <label>{t.gs_query}</label>
            <input
              type="text"
              value={query}
              placeholder={t.gs_query_ph}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void run();
              }}
            />
          </div>
        </div>

        <div className="form-grid">
          <div className="field">
            <label>{t.gs_mode_label}</label>
            <div className="capsule-tabs">
              {(["contains", "regex", "glob"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  className={`capsule-tab ${mode === m ? "active" : ""}`}
                  onClick={() => setMode(m)}
                >
                  {m === "contains" ? t.gs_mode_contains : m === "regex" ? t.gs_mode_regex : t.gs_mode_glob}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <label>{t.gs_ext_label}</label>
            <input
              type="text"
              value={extensions}
              placeholder={t.gs_ext_ph}
              onChange={(e) => setExtensions(e.target.value)}
            />
          </div>
        </div>

        <div className="form-grid">
          <div className="field">
            <label>{t.gs_min_label}</label>
            <input type="text" inputMode="decimal" value={minMb} onChange={(e) => setMinMb(e.target.value)} placeholder="0" />
          </div>
          <div className="field">
            <label>{t.gs_max_label}</label>
            <input type="text" inputMode="decimal" value={maxMb} onChange={(e) => setMaxMb(e.target.value)} />
          </div>
        </div>

        <div className="check-row" style={{ marginTop: "14px" }}>
          <label>
            <input type="checkbox" checked={includeHidden} onChange={(e) => setIncludeHidden(e.target.checked)} />
            {t.gs_hidden}
          </label>
          <label>
            <input type="checkbox" checked={caseSensitive} onChange={(e) => setCaseSensitive(e.target.checked)} />
            {t.gs_case}
          </label>
        </div>

        <p className="panel-note" style={{ marginTop: "14px" }}>
          {t.gs_hint}
        </p>
      </section>

      {error && (
        <div className="error-bar" role="alert" onClick={() => setError("")}>
          <span>{error}</span>
          <span style={{ cursor: "pointer" }}>×</span>
        </div>
      )}

      {report && (
        <section className="glass">
          <div className="dupes-toolbar" style={{ marginBottom: "14px", flexWrap: "wrap" }}>
            <span>
              {fmt(t.gs_results, { count: fmtNum(report.hits.length) })}
            </span>
            <span>
              {fmt(t.gs_scanned, { count: fmtNum(report.scanned), ms: fmtNum(report.elapsed_ms) })}
            </span>
            <div className="summary-actions">
              <span className="muted">{fmt(t.gs_selected, { count: fmtNum(selected.length) })}</span>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={selected.length === 0}
                onClick={() => onSend?.("archive", selected)}
              >
                {t.gs_send_zip}
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={selected.length === 0}
                onClick={() => onSend?.("renamer", selected)}
              >
                {t.gs_send_rename}
              </button>
            </div>
          </div>

          {report.truncated && (
            <p className="panel-note" style={{ marginBottom: "12px" }}>
              {fmt(t.gs_truncated, { count: fmtNum(report.hits.length) })}
            </p>
          )}

          <p className="panel-note" style={{ marginBottom: "12px" }}>
            {t.gs_send_hint}
          </p>

          {report.hits.length === 0 ? (
            <div className="empty-state">
              <h2>{t.gs_none_title}</h2>
              <p>{t.gs_none_body}</p>
            </div>
          ) : (
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th style={{ width: "34px" }}>
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={toggleAll}
                        aria-label={t.gs_select_all}
                      />
                    </th>
                    <th>{t.gs_col_name}</th>
                    <th>{t.gs_col_folder}</th>
                    <th>{t.gs_col_size}</th>
                    <th>{t.gs_col_date}</th>
                    <th aria-label={t.gs_reveal} />
                  </tr>
                </thead>
                <tbody>
                  {report.hits.map((hit) => (
                    <tr key={hit.path}>
                      <td>
                        <input
                          type="checkbox"
                          checked={selected.includes(hit.path)}
                          onChange={() => toggle(hit.path)}
                          aria-label={hit.name}
                        />
                      </td>
                      <td className="ellipsis" title={hit.path}>
                        <b>{hit.name}</b>
                      </td>
                      <td className="mono ellipsis" title={hit.folder}>
                        {hit.folder}
                      </td>
                      <td className="mono">{formatBytes(hit.size)}</td>
                      <td className="mono">
                        {hit.modified_ms
                          ? new Date(hit.modified_ms).toLocaleString(isRtl ? "fa-IR" : "en-US", {
                              dateStyle: "short",
                              timeStyle: "short",
                            })
                          : "—"}
                      </td>
                      <td>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => reveal(hit.folder)}>
                          {t.gs_reveal}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
