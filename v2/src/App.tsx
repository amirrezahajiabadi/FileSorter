import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import {
  CATEGORY_ICONS,
  type CategoryMap,
  type DiskStats,
  type DuplicateGroup,
  type ExecReport,
  type ScanProgress,
  type SortPlan,
  type UndoReport,
} from "./types";
import { STRINGS, CATEGORY_LABELS } from "./i18n";
import PdfStudio from "./PdfStudio";
import BatchRenamer from "./BatchRenamer";
import ImageStudio from "./ImageStudio";

type Phase = "idle" | "scanning" | "ready" | "sorting" | "done";
type ActiveTab = "sort" | "dupes" | "disk" | "renamer" | "images" | "pdf" | "settings";

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

export default function App() {
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    return (localStorage.getItem("fs_theme") as "dark" | "light") || "dark";
  });

  const [activeTab, setActiveTab] = useState<ActiveTab>("sort");
  const [phase, setPhase] = useState<Phase>("idle");
  const [folder, setFolder] = useState<string>("");
  const [scan, setScan] = useState<ScanProgress | null>(null);
  const [plan, setPlan] = useState<SortPlan | null>(null);
  const [showMoves, setShowMoves] = useState<boolean>(false);

  // Duplicates state
  const [dupes, setDupes] = useState<DuplicateGroup[]>([]);
  const [dupeBusy, setDupeBusy] = useState(false);
  const [dupeKeep, setDupeKeep] = useState<"oldest" | "newest">("oldest");
  const [quarantineReport, setQuarantineReport] = useState<ExecReport | null>(null);

  // Disk space stats
  const [diskStats, setDiskStats] = useState<DiskStats | null>(null);
  const [loadingDisk, setLoadingDisk] = useState(false);

  // Settings
  const [categories, setCategories] = useState<CategoryMap>({});
  const [newExts, setNewExts] = useState<Record<string, string>>({});
  const [settingsNotice, setSettingsNotice] = useState<string>("");

  // Reports
  const [report, setReport] = useState<ExecReport | null>(null);
  const [undoReport, setUndoReport] = useState<UndoReport | null>(null);
  const [error, setError] = useState<string>("");
  const unlisteners = useRef<UnlistenFn[]>([]);

  const t = STRINGS;
  const fmtNum = (n: number) => n.toLocaleString("en-US");
  const getCatLabel = (cat: string) => CATEGORY_LABELS[cat] ?? cat;

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("fs_theme", theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.setAttribute("lang", "en");
    document.documentElement.setAttribute("dir", "ltr");
    document.documentElement.setAttribute("data-lang", "en");
  }, []);

  const toggleTheme = () => {
    setTheme((t) => (t === "dark" ? "light" : "dark"));
  };

  useEffect(() => {
    const subs: Promise<UnlistenFn>[] = [
      listen<ScanProgress>("scan-progress", (e) => setScan(e.payload)),
      listen<{ stopped: boolean }>("scan-done", (e) => {
        setPhase(e.payload.stopped ? "idle" : "ready");
        setScan((s) => (s ? { ...s, done: true } : s));
      }),
      listen<{ groups?: DuplicateGroup[]; error?: string }>("dupes-done", (e) => {
        setDupeBusy(false);
        if (e.payload.error) {
          setError(e.payload.error);
        } else {
          setDupes(e.payload.groups ?? []);
        }
      }),
      listen<{ report?: ExecReport; error?: string }>("sort-done", (e) => {
        if (e.payload.error) {
          setError(e.payload.error);
          setPhase("ready");
        } else if (e.payload.report) {
          setReport(e.payload.report);
          setPhase("done");
        }
      }),
      listen<{ report?: ExecReport; error?: string }>("quarantine-done", (e) => {
        setDupeBusy(false);
        if (e.payload.error) {
          setError(e.payload.error);
        } else if (e.payload.report) {
          setQuarantineReport(e.payload.report);
        }
      }),
      listen<{ report?: UndoReport; error?: string }>("undo-done", (e) => {
        if (e.payload.error) {
          setError(e.payload.error);
        } else if (e.payload.report) {
          setUndoReport(e.payload.report);
        }
      }),
    ];
    Promise.all(subs).then((un) => {
      unlisteners.current = un;
    });

    // Load initial settings
    invoke<CategoryMap>("get_categories")
      .then(setCategories)
      .catch(() => {});

    return () => {
      unlisteners.current.forEach((u) => u());
      unlisteners.current = [];
    };
  }, []);

  const reset = useCallback(() => {
    setPhase("idle");
    setFolder("");
    setScan(null);
    setPlan(null);
    setShowMoves(false);
    setDupes([]);
    setDiskStats(null);
    setReport(null);
    setUndoReport(null);
    setQuarantineReport(null);
    setError("");
  }, []);

  const pickFolder = async () => {
    setError("");
    const picked = await invoke<string | null>("pick_folder");
    if (!picked) return;
    reset();
    setFolder(picked);
    setPhase("scanning");
    setScan({ total_so_far: 0, bytes_so_far: 0, batch_files: 0, done: false });
    try {
      await invoke("scan_start", { root: picked });
    } catch (e) {
      setError(String(e));
      setPhase("idle");
    }
  };

  const stopScan = () => invoke("scan_stop").catch(() => {});

  const loadResults = useCallback(async () => {
    try {
      const p = await invoke<SortPlan>("plan_sort");
      setPlan(p);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  useEffect(() => {
    if (phase === "ready") {
      loadResults();
    }
  }, [phase, loadResults]);

  const loadDiskStats = useCallback(async () => {
    if (phase !== "ready" && phase !== "done") return;
    setLoadingDisk(true);
    try {
      const stats = await invoke<DiskStats>("get_disk_stats");
      setDiskStats(stats);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoadingDisk(false);
    }
  }, [phase]);

  useEffect(() => {
    if (activeTab === "disk" && !diskStats && (phase === "ready" || phase === "done")) {
      loadDiskStats();
    }
  }, [activeTab, diskStats, phase, loadDiskStats]);

  const runDupes = async () => {
    setError("");
    setDupeBusy(true);
    setQuarantineReport(null);
    try {
      await invoke("analyze");
    } catch (e) {
      setError(String(e));
      setDupeBusy(false);
    }
  };

  const quarantineDuplicates = async () => {
    setError("");
    setDupeBusy(true);
    try {
      await invoke("quarantine_duplicates", { keep: dupeKeep });
    } catch (e) {
      setError(String(e));
      setDupeBusy(false);
    }
  };

  const executeSort = async () => {
    setError("");
    setPhase("sorting");
    try {
      await invoke("sort_execute");
    } catch (e) {
      setError(String(e));
      setPhase("ready");
    }
  };

  const undoLast = async () => {
    setError("");
    try {
      await invoke("undo_last");
    } catch (e) {
      setError(String(e));
    }
  };

  const saveSettings = async () => {
    try {
      await invoke("set_categories", { map: categories });
      setSettingsNotice(t.settings_saved_notice);
      setTimeout(() => setSettingsNotice(""), 3000);
    } catch (e) {
      setError(String(e));
    }
  };

  const resetSettings = async () => {
    try {
      const defs = await invoke<CategoryMap>("reset_categories");
      setCategories(defs);
      setSettingsNotice(t.settings_reset_notice);
      setTimeout(() => setSettingsNotice(""), 3000);
    } catch (e) {
      setError(String(e));
    }
  };

  const addExtension = (cat: string) => {
    const raw = (newExts[cat] || "").trim().toLowerCase();
    if (!raw) return;
    const ext = raw.startsWith(".") ? raw : `.${raw}`;
    if ((categories[cat] || []).includes(ext)) return;
    setCategories({
      ...categories,
      [cat]: [...(categories[cat] || []), ext],
    });
    setNewExts({ ...newExts, [cat]: "" });
  };

  const removeExtension = (cat: string, ext: string) => {
    setCategories({
      ...categories,
      [cat]: (categories[cat] || []).filter((e) => e !== ext),
    });
  };

  const pct = (a: number, b: number) => (b > 0 ? Math.min(100, Math.round((a / b) * 100)) : 0);

  return (
    <main className="app">
      {/* Floating Capsule Navbar (Supaste Style) */}
      <header className="capsule-nav">
        {/* Left: Brand */}
        <div className="capsule-brand">
          <div className="capsule-logo">
            <span className="capsule-logo-icon">⚡</span>
          </div>
          <span className="capsule-title">{t.app_title}</span>
          <span className="capsule-badge">v2.0</span>
        </div>

        {/* Center: Segmented Floating Tabs */}
        <nav className="capsule-tabs">
          <button
            className={`capsule-tab ${activeTab === "sort" ? "active" : ""}`}
            onClick={() => setActiveTab("sort")}
            title={t.tab_sort}
          >
            <span className="tab-icon">📁</span>
            <span className="tab-label">{t.tab_sort}</span>
          </button>
          <button
            className={`capsule-tab ${activeTab === "dupes" ? "active" : ""}`}
            onClick={() => setActiveTab("dupes")}
            title={t.tab_dupes}
          >
            <span className="tab-icon">🔍</span>
            <span className="tab-label">{t.tab_dupes}</span>
            {dupes.length > 0 && <span className="capsule-tab-badge">{dupes.length}</span>}
          </button>
          <button
            className={`capsule-tab ${activeTab === "renamer" ? "active" : ""}`}
            onClick={() => setActiveTab("renamer")}
            title={t.tab_renamer}
          >
            <span className="tab-icon">✏️</span>
            <span className="tab-label">{t.tab_renamer}</span>
          </button>
          <button
            className={`capsule-tab ${activeTab === "images" ? "active" : ""}`}
            onClick={() => setActiveTab("images")}
            title={t.tab_images}
          >
            <span className="tab-icon">🖼️</span>
            <span className="tab-label">{t.tab_images}</span>
          </button>
          <button
            className={`capsule-tab ${activeTab === "pdf" ? "active" : ""}`}
            onClick={() => setActiveTab("pdf")}
            title={t.tab_pdf}
          >
            <span className="tab-icon">📑</span>
            <span className="tab-label">{t.tab_pdf}</span>
          </button>
          <button
            className={`capsule-tab ${activeTab === "disk" ? "active" : ""}`}
            onClick={() => setActiveTab("disk")}
            title={t.tab_disk}
          >
            <span className="tab-icon">📊</span>
            <span className="tab-label">{t.tab_disk}</span>
          </button>
          <button
            className={`capsule-tab ${activeTab === "settings" ? "active" : ""}`}
            onClick={() => setActiveTab("settings")}
            title={t.tab_settings}
          >
            <span className="tab-icon">⚙️</span>
            <span className="tab-label">{t.tab_settings}</span>
          </button>
        </nav>

        {/* Right: Quick Action Controls */}
        <div className="capsule-actions">
          {folder && (
            <button className="capsule-btn-pill" onClick={reset} title={t.reset_folder}>
              <span>↺</span>
              <span className="capsule-btn-text">{t.reset_folder}</span>
            </button>
          )}
          <button
            className="capsule-btn-icon"
            onClick={toggleTheme}
            title={theme === "dark" ? t.theme_light : t.theme_dark}
          >
            {theme === "dark" ? "☀️" : "🌙"}
          </button>
        </div>
      </header>

      {error && (
        <div className="error-bar" role="alert" onClick={() => setError("")}>
          <span>⚠️ {error}</span>
          <span style={{ fontSize: "12px", opacity: 0.8 }}>✕</span>
        </div>
      )}

      {settingsNotice && (
        <div className="notice-bar glass">
          <span>✓ {settingsNotice}</span>
        </div>
      )}

      {/* TAB 1: Sorter */}
      {activeTab === "sort" && (
        <>
          {phase === "idle" && (
            <section className="hero glass">
              <h2>{t.hero_title}</h2>
              <p className="muted">{t.hero_subtitle}</p>
              <button className="btn btn-primary" onClick={pickFolder}>
                {t.hero_drop_btn}
              </button>
            </section>
          )}

          {phase === "scanning" && (
            <section className="hero glass">
              <h2>{t.hero_scanning}</h2>
              <p className="muted mono">{folder}</p>
              <div className="meter">
                <div
                  className="meter-fill"
                  style={{
                    width: `${scan ? (scan.done ? 100 : pct(scan.total_so_far, Math.max(scan.total_so_far, 1)) * 0.9) : 0}%`,
                  }}
                />
              </div>
              <p style={{ fontWeight: 600 }}>
                {scan ? fmtNum(scan.total_so_far) : 0} {t.hero_files_found}
                {scan && scan.bytes_so_far > 0 ? ` — ${formatBytes(scan.bytes_so_far)}` : ""}
              </p>
              <button className="btn btn-ghost" onClick={stopScan}>
                ✕ {t.hero_stop}
              </button>
            </section>
          )}

          {phase === "ready" && plan && (
            <>
              <section className="summary glass">
                <div className="stat">
                  <b>{fmtNum(plan.moves.length)}</b>
                  <span>{t.summary_files}</span>
                </div>
                <div className="stat">
                  <b>{formatBytes(plan.total_size)}</b>
                  <span>{t.summary_size}</span>
                </div>
                <div className="stat">
                  <b>{fmtNum(plan.counts.length)}</b>
                  <span>{t.summary_categories}</span>
                </div>
                <div className="summary-actions">
                  <button className="btn btn-ghost" onClick={() => setShowMoves(!showMoves)}>
                    {showMoves ? t.btn_hide_moves : `👁️ ${t.btn_show_moves}`}
                  </button>
                </div>
              </section>

              {showMoves && plan.moves.length > 0 && (
                <section className="glass table-container">
                  <table>
                    <thead>
                      <tr>
                        <th>{t.disk_col_name}</th>
                        <th>{t.summary_categories}</th>
                        <th>{t.disk_col_size}</th>
                        <th>{t.disk_col_path}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {plan.moves.slice(0, 100).map((m, idx) => (
                        <tr key={idx}>
                          <td className="mono ellipsis">{m.source.split(/[\\/]/).pop()}</td>
                          <td>{getCatLabel(m.category)}</td>
                          <td className="mono">{formatBytes(m.size)}</td>
                          <td className="muted mono ellipsis">{m.destination}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {plan.moves.length > 100 && (
                    <p className="muted" style={{ padding: "10px 16px", margin: 0 }}>
                      + {fmtNum(plan.moves.length - 100)} ...
                    </p>
                  )}
                </section>
              )}

              <section className="cards">
                {plan.counts.map(([cat, count]) => (
                  <div key={cat} className="card glass">
                    <span className="card-icon">{CATEGORY_ICONS[cat] ?? "•"}</span>
                    <div>
                      <b>{getCatLabel(cat)}</b>
                      <span className="muted">{fmtNum(count)} {t.settings_formats_count}</span>
                    </div>
                  </div>
                ))}
              </section>

              <section className="actions">
                <button className="btn btn-primary" onClick={executeSort} disabled={plan.moves.length === 0}>
                  {t.btn_sort_now} ({fmtNum(plan.moves.length)})
                </button>
                <button className="btn btn-ghost" onClick={pickFolder}>
                  {t.reset_folder}
                </button>
              </section>
            </>
          )}

          {phase === "sorting" && (
            <section className="hero glass">
              <h2>{t.btn_sorting}</h2>
              <div className="meter">
                <div className="meter-fill indeterminate" />
              </div>
              <p className="muted">{t.app_subtitle}</p>
            </section>
          )}

          {phase === "done" && report && (
            <section className="hero glass">
              <h2>{t.sort_done_title}</h2>
              <p>
                <b>{fmtNum(report.moved)}</b> {t.sort_done_desc}
                {report.skipped > 0 ? ` — ${fmtNum(report.skipped)} ${t.undo_skipped}` : ""}
              </p>
              {report.skipped_examples.length > 0 && (
                <details className="mono muted">
                  <summary>Details</summary>
                  <pre>{report.skipped_examples.join("\n")}</pre>
                </details>
              )}
              <div className="actions">
                <button className="btn btn-primary" onClick={undoLast}>
                  {t.btn_undo}
                </button>
                <button className="btn btn-ghost" onClick={pickFolder}>
                  {t.reset_folder}
                </button>
              </div>
              {undoReport && (
                <p className={undoReport.skipped > 0 ? "warn" : "ok"} style={{ fontWeight: 600 }}>
                  {fmtNum(undoReport.restored)} {t.undo_success}
                </p>
              )}
            </section>
          )}
        </>
      )}

      {/* TAB 2: Duplicate Finder */}
      {activeTab === "dupes" && (
        <section className="glass dupes">
          <div className="dupes-header">
            <div>
              <h3>{t.dupes_title}</h3>
              <p className="muted" style={{ margin: "4px 0 0" }}>
                {t.dupes_desc}
              </p>
            </div>
            <div className="summary-actions">
              {folder ? (
                <button className="btn btn-primary" onClick={runDupes} disabled={dupeBusy}>
                  {dupeBusy ? t.dupes_btn_scanning : t.dupes_btn_scan}
                </button>
              ) : (
                <button className="btn btn-primary" onClick={pickFolder}>
                  {t.hero_drop_btn}
                </button>
              )}
            </div>
          </div>

          {quarantineReport && (
            <div className="notice-bar glass" style={{ margin: "14px 0" }}>
              ✓ {fmtNum(quarantineReport.moved)} {t.dupes_quarantine_done}
            </div>
          )}

          {dupes.length > 0 ? (
            <>
              <div className="summary" style={{ padding: "14px 0", borderBottom: "1px solid var(--line)" }}>
                <div className="stat">
                  <b>{fmtNum(dupes.length)}</b>
                  <span>{t.tab_dupes}</span>
                </div>
                <div className="stat">
                  <b style={{ color: "var(--text)" }}>{formatBytes(dupes.reduce((s, g) => s + g.wasted, 0))}</b>
                  <span>{t.dupes_reclaimable}</span>
                </div>
                <div className="summary-actions" style={{ alignItems: "center" }}>
                  <button
                    className={`btn ${dupeKeep === "oldest" ? "btn-primary" : "btn-ghost"}`}
                    onClick={() => setDupeKeep("oldest")}
                  >
                    {t.dupes_keep_oldest}
                  </button>
                  <button
                    className={`btn ${dupeKeep === "newest" ? "btn-primary" : "btn-ghost"}`}
                    onClick={() => setDupeKeep("newest")}
                  >
                    {t.dupes_keep_newest}
                  </button>
                  <button className="btn btn-primary" onClick={quarantineDuplicates} disabled={dupeBusy}>
                    {t.dupes_btn_quarantine}
                  </button>
                </div>
              </div>

              <ul>
                {dupes.map((g) => (
                  <li key={g.hash}>
                    <span className="mono">{fmtNum(g.files.length)} copies</span>
                    <span className="mono">{formatBytes(g.wasted)}</span>
                    <div>
                      <b className="ellipsis" style={{ display: "block" }}>
                        {g.files[0].path.split(/[\\/]/).pop()}
                      </b>
                      <span className="muted mono ellipsis" style={{ fontSize: "11px", display: "block" }}>
                        {g.files.map((f) => f.path).join("  |  ")}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            !dupeBusy && (
              <p className="muted" style={{ padding: "32px 0", textAlign: "center" }}>
                {folder ? t.dupes_empty : t.disk_pick_first}
              </p>
            )
          )}
        </section>
      )}

      {/* TAB 3: Disk Space */}
      {activeTab === "disk" && (
        <section className="glass disk-bars">
          <div className="dupes-header">
            <div>
              <h3>{t.disk_title}</h3>
              <p className="muted" style={{ margin: "4px 0 0" }}>
                {t.disk_desc}
              </p>
            </div>
            {folder && (
              <button className="btn btn-ghost" onClick={loadDiskStats} disabled={loadingDisk}>
                {loadingDisk ? t.disk_loading : `🔄 ${t.btn_rescan}`}
              </button>
            )}
          </div>

          {diskStats ? (
            <>
              <div className="summary" style={{ padding: "14px 0", borderBottom: "1px solid var(--line)" }}>
                <div className="stat">
                  <b>{fmtNum(diskStats.total_files)}</b>
                  <span>{t.disk_total_files}</span>
                </div>
                <div className="stat">
                  <b>{formatBytes(diskStats.total_bytes)}</b>
                  <span>{t.disk_total_size}</span>
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "12px", margin: "16px 0" }}>
                <b>{t.disk_category_breakdown}</b>
                {diskStats.category_breakdown.map(([cat, count, bytes]) => {
                  const share = pct(bytes, diskStats.total_bytes);
                  return (
                    <div key={cat} className="disk-bar-row">
                      <div className="disk-bar-header">
                        <span>
                          {CATEGORY_ICONS[cat] ?? "•"} {getCatLabel(cat)} ({fmtNum(count)} {t.settings_formats_count})
                        </span>
                        <span className="mono">
                          {formatBytes(bytes)} ({share}%)
                        </span>
                      </div>
                      <div className="meter" style={{ width: "100%" }}>
                        <div className="meter-fill" style={{ width: `${share}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>

              <div style={{ marginTop: "20px" }}>
                <b>{t.disk_largest_files}</b>
                <div className="table-container" style={{ marginTop: "10px" }}>
                  <table>
                    <thead>
                      <tr>
                        <th>{t.disk_col_name}</th>
                        <th>{t.disk_col_size}</th>
                        <th>{t.disk_col_path}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {diskStats.largest_files.map(([filePath, size], i) => (
                        <tr key={i}>
                          <td className="mono ellipsis">{filePath.split(/[\\/]/).pop()}</td>
                          <td className="mono" style={{ color: "var(--text)" }}>
                            {formatBytes(size)}
                          </td>
                          <td className="muted mono ellipsis">{filePath}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : (
            <p className="muted" style={{ padding: "36px 0", textAlign: "center" }}>
              {folder ? t.disk_loading : t.disk_pick_first}
            </p>
          )}
        </section>
      )}

      {/* TAB: Smart Batch Renamer */}
      {activeTab === "renamer" && <BatchRenamer />}

      {/* TAB: Image Studio */}
      {activeTab === "images" && <ImageStudio />}

      {/* TAB: PDF Studio */}
      {activeTab === "pdf" && <PdfStudio />}

      {/* TAB 4: Settings */}
      {activeTab === "settings" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {/* Categories and File Formats */}
          <section className="glass">
            <div className="dupes-header" style={{ padding: "20px 24px 0" }}>
              <div>
                <h3>{t.settings_cat_title}</h3>
                <p className="muted" style={{ margin: "4px 0 0" }}>
                  {t.settings_cat_desc}
                </p>
              </div>
              <div className="summary-actions">
                <button className="btn btn-primary" onClick={saveSettings}>
                  {t.settings_btn_save}
                </button>
                <button className="btn btn-ghost" onClick={resetSettings}>
                  {t.settings_btn_reset}
                </button>
              </div>
            </div>

            <div className="settings-grid" style={{ padding: "20px 24px" }}>
              {Object.entries(categories).map(([cat, exts]) => (
                <div key={cat} className="glass cat-box">
                  <div className="cat-box-header">
                    <span>
                      {CATEGORY_ICONS[cat] ?? "•"} {getCatLabel(cat)}
                    </span>
                    <span className="muted mono" style={{ fontSize: "11px" }}>
                      {fmtNum(exts.length)} {t.settings_formats_count}
                    </span>
                  </div>
                  <div className="tags">
                    {exts.map((e) => (
                      <span key={e} className="tag mono">
                        {e}
                        <button onClick={() => removeExtension(cat, e)} title="Remove">
                          ✕
                        </button>
                      </span>
                    ))}
                  </div>
                  <div className="add-tag-form">
                    <input
                      type="text"
                      placeholder={t.settings_add_placeholder}
                      value={newExts[cat] || ""}
                      onChange={(e) => setNewExts({ ...newExts, [cat]: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addExtension(cat);
                        }
                      }}
                      style={{ flex: 1 }}
                    />
                    <button className="btn btn-icon btn-ghost" onClick={() => addExtension(cat)} title={t.settings_add_btn}>
                      {t.settings_add_btn}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      <footer className="muted">
        {t.footer_text} <span className="mono">{t.footer_journal}</span>
      </footer>
    </main>
  );
}
