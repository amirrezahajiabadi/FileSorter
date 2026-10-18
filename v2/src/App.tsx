import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import {
  CATEGORY_ICONS,
  CATEGORY_LABELS,
  type CategoryMap,
  type DiskStats,
  type DuplicateGroup,
  type ExecReport,
  type ScanProgress,
  type SortPlan,
  type UndoReport,
} from "./types";

type Phase = "idle" | "scanning" | "ready" | "sorting" | "done";
type ActiveTab = "sort" | "dupes" | "disk" | "settings";

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

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("fs_theme", theme);
  }, [theme]);

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
      setSettingsNotice("تنظیمات با موفقیت ذخیره شد");
      setTimeout(() => setSettingsNotice(""), 3000);
    } catch (e) {
      setError(String(e));
    }
  };

  const resetSettings = async () => {
    try {
      const defs = await invoke<CategoryMap>("reset_categories");
      setCategories(defs);
      setSettingsNotice("تنظیمات به حالت پیش‌فرض بازگشت");
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
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">FS</span>
          <div>
            <h1>فایل‌ساز v2</h1>
            <p>مرتب‌ساز فوق‌سریع فایل‌ها — قدرت گرفته از Rust & Tauri</p>
          </div>
        </div>
        <div className="topbar-actions">
          {folder && (
            <button className="btn btn-ghost" onClick={reset} title="شروع دوباره با پوشه جدید">
              ↺ پوشه جدید
            </button>
          )}
          <button
            className="btn btn-icon btn-ghost"
            onClick={toggleTheme}
            title={theme === "dark" ? "تغییر به تم روشن" : "تغییر به تم تاریک"}
          >
            {theme === "dark" ? "☀️" : "🌙"}
          </button>
        </div>
      </header>

      {/* Tabs */}
      <nav className="tabs">
        <button
          className={`tab-btn ${activeTab === "sort" ? "active" : ""}`}
          onClick={() => setActiveTab("sort")}
        >
          <span>📁</span>
          <span>مرتب‌سازی فایل‌ها</span>
        </button>
        <button
          className={`tab-btn ${activeTab === "dupes" ? "active" : ""}`}
          onClick={() => setActiveTab("dupes")}
        >
          <span>🔍</span>
          <span>فایل‌های تکراری</span>
          {dupes.length > 0 && <span className="tab-badge">{dupes.length}</span>}
        </button>
        <button
          className={`tab-btn ${activeTab === "disk" ? "active" : ""}`}
          onClick={() => setActiveTab("disk")}
        >
          <span>📊</span>
          <span>تحلیل فضای دیسک</span>
        </button>
        <button
          className={`tab-btn ${activeTab === "settings" ? "active" : ""}`}
          onClick={() => setActiveTab("settings")}
        >
          <span>⚙️</span>
          <span>دسته‌بندی و تنظیمات</span>
        </button>
      </nav>

      {error && (
        <div className="error-bar" role="alert" onClick={() => setError("")}>
          <span>⚠️ {error}</span>
          <span style={{ fontSize: "12px", opacity: 0.8 }}>بستن ✕</span>
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
              <h2>پوشه مورد نظر را برای مرتب‌سازی انتخاب کنید</h2>
              <p className="muted">
                فایل‌ها بدون رونویسی به پوشه‌های <code>sorted/تصاویر</code>، <code>sorted/اسناد</code> و… منتقل می‌شوند.
                هر عملیات دارای ژورنال بازگردانی اتمیک و دکمه Undo آنی است.
              </p>
              <button className="btn btn-primary" onClick={pickFolder}>
                📁 انتخاب پوشه و اسکن سریع
              </button>
            </section>
          )}

          {phase === "scanning" && (
            <section className="hero glass">
              <h2>در حال اسکن موازی پوشه…</h2>
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
                {scan ? scan.total_so_far.toLocaleString("fa-IR") : 0} فایل شمارش شد
                {scan && scan.bytes_so_far > 0 ? ` — ${formatBytes(scan.bytes_so_far)}` : ""}
              </p>
              <button className="btn btn-ghost" onClick={stopScan}>
                ✕ توقف اسکن
              </button>
            </section>
          )}

          {phase === "ready" && plan && (
            <>
              <section className="summary glass">
                <div className="stat">
                  <b>{plan.moves.length.toLocaleString("fa-IR")}</b>
                  <span>فایل برای انتقال</span>
                </div>
                <div className="stat">
                  <b>{formatBytes(plan.total_size)}</b>
                  <span>حجم کل فایل‌ها</span>
                </div>
                <div className="stat">
                  <b>{plan.counts.length}</b>
                  <span>دسته فعال</span>
                </div>
                <div className="summary-actions">
                  <button className="btn btn-ghost" onClick={() => setShowMoves(!showMoves)}>
                    {showMoves ? "مخفی کردن پیش‌نمایش" : "👁️ مشاهده پیش‌نمایش فایل‌ها"}
                  </button>
                </div>
              </section>

              {showMoves && plan.moves.length > 0 && (
                <section className="glass table-container">
                  <table>
                    <thead>
                      <tr>
                        <th>نام فایل</th>
                        <th>دسته</th>
                        <th>حجم</th>
                        <th>مسیر مقصد جدید</th>
                      </tr>
                    </thead>
                    <tbody>
                      {plan.moves.slice(0, 100).map((m, idx) => (
                        <tr key={idx}>
                          <td className="mono ellipsis">{m.source.split(/[\\/]/).pop()}</td>
                          <td>{CATEGORY_LABELS[m.category] ?? m.category}</td>
                          <td className="mono">{formatBytes(m.size)}</td>
                          <td className="muted mono ellipsis">{m.destination}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {plan.moves.length > 100 && (
                    <p className="muted" style={{ padding: "10px 16px", margin: 0 }}>
                      و {plan.moves.length - 100} فایل دیگر…
                    </p>
                  )}
                </section>
              )}

              <section className="cards">
                {plan.counts.map(([cat, count]) => (
                  <div key={cat} className="card glass">
                    <span className="card-icon">{CATEGORY_ICONS[cat] ?? "•"}</span>
                    <div>
                      <b>{CATEGORY_LABELS[cat] ?? cat}</b>
                      <span className="muted">{count.toLocaleString("fa-IR")} فایل</span>
                    </div>
                  </div>
                ))}
              </section>

              <section className="actions">
                <button className="btn btn-primary" onClick={executeSort} disabled={plan.moves.length === 0}>
                  ✓ مرتب‌سازی {plan.moves.length.toLocaleString("fa-IR")} فایل
                </button>
                <button className="btn btn-ghost" onClick={pickFolder}>
                  انتخاب پوشه دیگر
                </button>
              </section>
            </>
          )}

          {phase === "sorting" && (
            <section className="hero glass">
              <h2>در حال انتقال فایل‌ها…</h2>
              <div className="meter">
                <div className="meter-fill indeterminate" />
              </div>
              <p className="muted">انتقال‌ها درون‌درایو به شکل آنی (rename) و بین درایوها با کپی و تأیید انجام می‌شوند.</p>
            </section>
          )}

          {phase === "done" && report && (
            <section className="hero glass">
              <h2>مرتب‌سازی با موفقیت انجام شد ✓</h2>
              <p>
                <b>{report.moved.toLocaleString("fa-IR")}</b> فایل با موفقیت سازمان‌دهی شد
                {report.skipped > 0 ? ` — ${report.skipped.toLocaleString("fa-IR")} فایل در دسترس نبود` : ""}
              </p>
              {report.skipped_examples.length > 0 && (
                <details className="mono muted">
                  <summary>جزئیات فایل‌های ردشده</summary>
                  <pre>{report.skipped_examples.join("\n")}</pre>
                </details>
              )}
              <div className="actions">
                <button className="btn btn-primary" onClick={undoLast}>
                  ↩ واگرد این عملیات (Undo)
                </button>
                <button className="btn btn-ghost" onClick={pickFolder}>
                  مرتب‌سازی پوشه جدید
                </button>
              </div>
              {undoReport && (
                <p className={undoReport.skipped > 0 ? "warn" : "ok"} style={{ fontWeight: 600 }}>
                  واگرد شد: {undoReport.restored.toLocaleString("fa-IR")} فایل به جای قبلی بازگردانده شد
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
              <h3>تحلیل و مدیریت فایل‌های تکراری</h3>
              <p className="muted" style={{ margin: "4px 0 0" }}>
                الگوریتم ۳ مرحله‌ای هش هوشمند با کش ماندگار (حجم → هش اولیه ۶۴KB → هش کامل SHA-256)
              </p>
            </div>
            <div className="summary-actions">
              {folder ? (
                <button className="btn btn-primary" onClick={runDupes} disabled={dupeBusy}>
                  {dupeBusy ? "در حال پردازش هش‌ها…" : "⚡ اسکن تکراری‌ها"}
                </button>
              ) : (
                <button className="btn btn-primary" onClick={pickFolder}>
                  📁 انتخاب پوشه
                </button>
              )}
            </div>
          </div>

          {quarantineReport && (
            <div className="notice-bar glass" style={{ margin: "14px 0" }}>
              ✓ {quarantineReport.moved.toLocaleString("fa-IR")} فایل تکراری با موفقیت به پوشه قرنطینه منتقل شد.
            </div>
          )}

          {dupes.length > 0 ? (
            <>
              <div className="summary" style={{ padding: "14px 0", borderBottom: "1px solid var(--line)" }}>
                <div className="stat">
                  <b>{dupes.length.toLocaleString("fa-IR")}</b>
                  <span>گروه تکراری</span>
                </div>
                <div className="stat">
                  <b style={{ color: "var(--accent)" }}>{formatBytes(dupes.reduce((s, g) => s + g.wasted, 0))}</b>
                  <span>فضای قابل آزادسازی</span>
                </div>
                <div className="summary-actions" style={{ alignItems: "center" }}>
                  <span className="muted" style={{ fontSize: "12px" }}>نسخه اصلی:</span>
                  <button
                    className={`btn ${dupeKeep === "oldest" ? "btn-primary" : "btn-ghost"}`}
                    onClick={() => setDupeKeep("oldest")}
                  >
                    قدیمی‌ترین
                  </button>
                  <button
                    className={`btn ${dupeKeep === "newest" ? "btn-primary" : "btn-ghost"}`}
                    onClick={() => setDupeKeep("newest")}
                  >
                    جدیدترین
                  </button>
                  <button className="btn btn-primary" onClick={quarantineDuplicates} disabled={dupeBusy}>
                    📦 قرنطینه تکراری‌ها
                  </button>
                </div>
              </div>

              <ul>
                {dupes.map((g) => (
                  <li key={g.hash}>
                    <span className="mono">{g.files.length} نسخه</span>
                    <span className="mono" style={{ color: "var(--accent)" }}>{formatBytes(g.wasted)}</span>
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
                {folder ? "برای یافتن فایل‌های تکراری روی «اسکن تکراری‌ها» کلیک کنید." : "ابتدا یک پوشه را انتخاب کنید."}
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
              <h3>تحلیل فضای ذخیره‌سازی پوشه</h3>
              <p className="muted" style={{ margin: "4px 0 0" }}>
                تفکیک حجم فایل‌ها بر اساس دسته‌بندی و فهرست ۲۰ فایل حجیم‌تر
              </p>
            </div>
            {folder && (
              <button className="btn btn-ghost" onClick={loadDiskStats} disabled={loadingDisk}>
                {loadingDisk ? "در حال محاسبه…" : "🔄 بروزرسانی آمار"}
              </button>
            )}
          </div>

          {diskStats ? (
            <>
              <div className="summary" style={{ padding: "14px 0", borderBottom: "1px solid var(--line)" }}>
                <div className="stat">
                  <b>{diskStats.total_files.toLocaleString("fa-IR")}</b>
                  <span>تعداد کل فایل‌ها</span>
                </div>
                <div className="stat">
                  <b>{formatBytes(diskStats.total_bytes)}</b>
                  <span>حجم کل</span>
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "12px", margin: "16px 0" }}>
                <b>تفکیک دسته‌ها:</b>
                {diskStats.category_breakdown.map(([cat, count, bytes]) => {
                  const share = pct(bytes, diskStats.total_bytes);
                  return (
                    <div key={cat} className="disk-bar-row">
                      <div className="disk-bar-header">
                        <span>
                          {CATEGORY_ICONS[cat] ?? "•"} {CATEGORY_LABELS[cat] ?? cat} ({count.toLocaleString("fa-IR")} فایل)
                        </span>
                        <span className="mono">
                          {formatBytes(bytes)} ({share}٪)
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
                <b>۲۰ فایل حجیم‌تر:</b>
                <div className="table-container" style={{ marginTop: "10px" }}>
                  <table>
                    <thead>
                      <tr>
                        <th>نام فایل</th>
                        <th>حجم</th>
                        <th>مسیر کامل</th>
                      </tr>
                    </thead>
                    <tbody>
                      {diskStats.largest_files.map(([filePath, size], i) => (
                        <tr key={i}>
                          <td className="mono ellipsis">{filePath.split(/[\\/]/).pop()}</td>
                          <td className="mono" style={{ color: "var(--accent)" }}>
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
              {folder ? "در حال بارگذاری اطلاعات دیسک…" : "ابتدا از برگه مرتب‌سازی پوشه‌ای را انتخاب کنید."}
            </p>
          )}
        </section>
      )}

      {/* TAB 4: Settings */}
      {activeTab === "settings" && (
        <section className="glass">
          <div className="dupes-header" style={{ padding: "20px 24px 0" }}>
            <div>
              <h3>دسته‌بندی‌ها و فرمت‌های فایل</h3>
              <p className="muted" style={{ margin: "4px 0 0" }}>
                تعیین فرمت‌های تحت پوشش هر دسته یا افزودن پسوندهای سفارشی
              </p>
            </div>
            <div className="summary-actions">
              <button className="btn btn-primary" onClick={saveSettings}>
                💾 ذخیره تنظیمات
              </button>
              <button className="btn btn-ghost" onClick={resetSettings}>
                ↺ بازگردانی پیش‌فرض
              </button>
            </div>
          </div>

          <div className="settings-grid">
            {Object.entries(categories).map(([cat, exts]) => (
              <div key={cat} className="glass cat-box">
                <div className="cat-box-header">
                  <span>
                    {CATEGORY_ICONS[cat] ?? "•"} {CATEGORY_LABELS[cat] ?? cat}
                  </span>
                  <span className="muted mono" style={{ fontSize: "11px" }}>
                    {exts.length} فرمت
                  </span>
                </div>
                <div className="tags">
                  {exts.map((e) => (
                    <span key={e} className="tag mono">
                      {e}
                      <button onClick={() => removeExtension(cat, e)} title="حذف این پسوند">
                        ✕
                      </button>
                    </span>
                  ))}
                </div>
                <div className="add-tag-form">
                  <input
                    type="text"
                    placeholder="پسوند جدید (مثال: .webp)"
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
                  <button className="btn btn-icon btn-ghost" onClick={() => addExtension(cat)} title="افزودن">
                    +
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <footer className="muted">
        فایل‌ساز نسخه ۲ · معماری مدرن، موازی و ۱۰۰٪ ایمن با Rust & Tauri · مسیر ژورنال:{" "}
        <span className="mono">%APPDATA%\FileSorterV2\undo</span>
      </footer>
    </main>
  );
}
