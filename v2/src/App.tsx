import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import {
  CATEGORY_ICONS,
  CATEGORY_LABELS,
  type DuplicateGroup,
  type ExecReport,
  type ScanProgress,
  type SortPlan,
  type UndoReport,
} from "./types";

type Phase = "idle" | "scanning" | "ready" | "sorting" | "done";

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
  const [phase, setPhase] = useState<Phase>("idle");
  const [folder, setFolder] = useState<string>("");
  const [scan, setScan] = useState<ScanProgress | null>(null);
  const [plan, setPlan] = useState<SortPlan | null>(null);
  const [dupes, setDupes] = useState<DuplicateGroup[]>([]);
  const [dupeBusy, setDupeBusy] = useState(false);
  const [report, setReport] = useState<ExecReport | null>(null);
  const [undoReport, setUndoReport] = useState<UndoReport | null>(null);
  const [error, setError] = useState<string>("");
  const unlisteners = useRef<UnlistenFn[]>([]);

  useEffect(() => {
    const subs: Promise<UnlistenFn>[] = [
      listen<ScanProgress>("scan-progress", (e) => setScan(e.payload)),
      listen<{ stopped: boolean }>("scan-done", (e) => {
        setPhase(e.payload.stopped ? "idle" : "ready");
        setScan((s) => (s ? { ...s, done: true } : s));
      }),
      listen<{ groups: DuplicateGroup[] }>("dupes-done", (e) => {
        setDupes(e.payload.groups ?? []);
        setDupeBusy(false);
      }),
      listen<ExecReport>("sort-done", (e) => {
        setReport(e.payload);
        setPhase("done");
      }),
      listen<UndoReport>("undo-done", (e) => {
        setUndoReport(e.payload);
      }),
    ];
    Promise.all(subs).then((un) => {
      unlisteners.current = un;
    });
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
    setDupes([]);
    setReport(null);
    setUndoReport(null);
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
    if (phase === "ready") loadResults();
  }, [phase, loadResults]);

  const runDupes = async () => {
    setError("");
    setDupeBusy(true);
    try {
      await invoke("analyze");
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

  const pct = (a: number, b: number) => (b > 0 ? Math.min(100, Math.round((a / b) * 100)) : 0);

  return (
    <main className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">FS</span>
          <div>
            <h1>فایل‌ساز</h1>
            <p>مرتب‌ساز سریع و امن فایل‌ها — نسخه ۲</p>
          </div>
        </div>
        {folder && (
          <button className="ghost" onClick={reset} title="شروع دوباره">
            شروع دوباره
          </button>
        )}
      </header>

      {error && (
        <div className="error-bar" role="alert" onClick={() => setError("")}>
          {error}
        </div>
      )}

      {phase === "idle" && (
        <section className="hero glass">
          <h2>کدام پوشه را مرتب کنیم؟</h2>
          <p className="muted">
            فایل‌ها به پوشه‌های <code>sorted/تصاویر</code>، <code>sorted/اسناد</code> و… منتقل می‌شوند.
            هیچ‌چیز بازنویسی یا حذف نمی‌شود و هر عملیات با یک کلیک واگرد می‌شود.
          </p>
          <button className="primary" onClick={pickFolder}>
            انتخاب پوشه و اسکن
          </button>
        </section>
      )}

      {phase === "scanning" && (
        <section className="hero glass">
          <h2>در حال اسکن…</h2>
          <p className="muted mono">{folder}</p>
          <div className="meter">
            <div
              className="meter-fill"
              style={{ width: `${scan ? (scan.done ? 100 : pct(scan.total_so_far, Math.max(scan.total_so_far, 1)) * 0.9) : 0}%` }}
            />
          </div>
          <p>
            {scan ? scan.total_so_far.toLocaleString("fa-IR") : 0} فایل
            {scan && scan.bytes_so_far > 0 ? ` — ${formatBytes(scan.bytes_so_far)}` : ""}
          </p>
          <button className="ghost" onClick={stopScan}>
            توقف
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
              <span>حجم کل</span>
            </div>
            <div className="stat">
              <b>{dupes.length.toLocaleString("fa-IR")}</b>
              <span>گروه تکراری</span>
            </div>
            <button className="ghost" onClick={runDupes} disabled={dupeBusy}>
              {dupeBusy ? "در حال تحلیل…" : "تحلیل تکراری‌ها"}
            </button>
          </section>

          <section className="cards">
            {plan.counts.map(([cat, count]) => (
              <div key={cat} className="card glass">
                <span className="card-icon">{CATEGORY_ICONS[cat] ?? "•"}</span>
                <div>
                  <b>{CATEGORY_LABELS[cat] ?? cat}</b>
                  <span>{count.toLocaleString("fa-IR")} فایل</span>
                </div>
              </div>
            ))}
          </section>

          {dupes.length > 0 && (
            <section className="dupes glass">
              <h3>
                تکراری‌ها — {formatBytes(dupes.reduce((s, g) => s + g.wasted, 0))} قابل آزادسازی
              </h3>
              <ul>
                {dupes.slice(0, 12).map((g) => (
                  <li key={g.hash}>
                    <span className="mono">{g.files.length} نسخه</span>
                    <span>{formatBytes(g.wasted)}</span>
                    <span className="muted ellipsis">{g.files[0].path.split(/[\\/]/).pop()}</span>
                  </li>
                ))}
              </ul>
              {dupes.length > 12 && <p className="muted">و {dupes.length - 12} گروه دیگر…</p>}
            </section>
          )}

          <section className="actions">
            <button className="primary" onClick={executeSort} disabled={plan.moves.length === 0}>
              مرتب‌سازی {plan.moves.length.toLocaleString("fa-IR")} فایل
            </button>
            <button className="ghost" onClick={pickFolder}>
              پوشهٔ دیگر
            </button>
          </section>
        </>
      )}

      {phase === "sorting" && (
        <section className="hero glass">
          <h2>در حال انتقال…</h2>
          <div className="meter">
            <div className="meter-fill indeterminate" />
          </div>
          <p className="muted">فایل‌ها با rename منتقل می‌شوند؛ هر انتقال در ژورنال ثبت می‌شود.</p>
        </section>
      )}

      {phase === "done" && report && (
        <section className="hero glass">
          <h2>تمام شد ✓</h2>
          <p>
            <b>{report.moved.toLocaleString("fa-IR")}</b> فایل منتقل شد
            {report.skipped > 0 ? ` — ${report.skipped.toLocaleString("fa-IR")} فایل قفل/در دسترس نبود` : ""}
          </p>
          {report.skipped_examples.length > 0 && (
            <details className="mono muted">
              <summary>جزئیات فایل‌های ردشده</summary>
              <pre>{report.skipped_examples.join("\n")}</pre>
            </details>
          )}
          <div className="actions">
            <button className="primary" onClick={undoLast}>
              واگرد این عملیات
            </button>
            <button className="ghost" onClick={pickFolder}>
              پوشهٔ جدید
            </button>
          </div>
          {undoReport && (
            <p className={undoReport.skipped > 0 ? "warn" : "ok"}>
              واگرد شد: {undoReport.restored.toLocaleString("fa-IR")} فایل بازگشت
              {undoReport.skipped > 0 ? ` — ${undoReport.skipped.toLocaleString("fa-IR")} مورد نشد (جزئیات در کنسول)` : ""}
            </p>
          )}
        </section>
      )}

      <footer className="muted">
        همهٔ انتقال‌ها بدون بازنویسی انجام می‌شوند · ژورنال واگرد:{" "}
        <span className="mono">%APPDATA%\FileSorterV2\undo</span>
      </footer>
    </main>
  );
}
