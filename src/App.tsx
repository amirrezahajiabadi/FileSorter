import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import {
  type CategoryMap,
  type CleanReport,
  type DiskStats,
  type DriveInfo,
  type DuplicateGroup,
  type DroppedPaths,
  type ExecReport,
  type ExtrasReport,
  type ExtrasScan,
  type HistoryEntry,
  type JunkLocation,
  type ScanProgress,
  type ScheduledTask,
  type SmartRule,
  type SortPlan,
  type TaskRunResult,
  type UndoReport,
  type UpdateCheckResult,
  type WatchEventPayload,
  type WatchStatus,
} from "./types";
import {
  detectInitialLocale,
  fmt,
  getCategoryLabel,
  getStrings,
  type I18nStrings,
  type Locale,
} from "./i18n";
import OnboardingModal from "./OnboardingModal";
import UpdateModal from "./UpdateModal";

const BatchRenamer = lazy(() => import("./BatchRenamer"));
const ImageStudio = lazy(() => import("./ImageStudio"));
const PdfStudio = lazy(() => import("./PdfStudio"));
const SearchPanel = lazy(() => import("./SearchPanel"));
const ComparePanel = lazy(() => import("./ComparePanel"));
const ArchivePanel = lazy(() => import("./ArchivePanel"));

export type Theme = "fluent" | "dark" | "light" | "aurora" | "sunset";

export interface ThemeMeta {
  id: Theme;
  swatch: string[];
}

export const THEMES: ThemeMeta[] = [
  {
    id: "fluent",
    swatch: ["#121316", "#191b1f", "#d6a153"],
  },
  {
    id: "dark",
    swatch: ["#000000", "#161619", "#a9bdd4"],
  },
  {
    id: "light",
    swatch: ["#f2f3f1", "#ffffff", "#2c5c9c"],
  },
  {
    id: "aurora",
    swatch: ["#0a1112", "#172425", "#6cc4b0"],
  },
  {
    id: "sunset",
    swatch: ["#f4efed", "#fffbfa", "#a04752"],
  },
];

/** Theme display copy resolved from the active locale's string table. */
export function themeMeta(t: I18nStrings, id: Theme): { name: string; desc: string } {
  const map: Record<Theme, { name: string; desc: string }> = {
    fluent: { name: t.theme_name_fluent, desc: t.theme_desc_fluent },
    dark: { name: t.theme_name_dark, desc: t.theme_desc_dark },
    light: { name: t.theme_name_light, desc: t.theme_desc_light },
    aurora: { name: t.theme_name_aurora, desc: t.theme_desc_aurora },
    sunset: { name: t.theme_name_sunset, desc: t.theme_desc_sunset },
  };
  return map[id];
}

type IconName =
  | "drop" | "folder" | "broom" | "search" | "chart" | "eye" | "clock"
  | "pen" | "image" | "pdf" | "settings" | "spark" | "home" | "refresh"
  | "palette" | "history" | "chevronLeft" | "chevronRight" | "info" | "bolt" | "menu"
  | "compare" | "archive";

function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, ReactNode> = {
    drop: <path d="M12 3.2c3.3 4 5.6 6.8 5.6 9.7A5.6 5.6 0 0 1 12 18.5a5.6 5.6 0 0 1-5.6-5.6c0-2.9 2.3-5.7 5.6-9.7Z" />,
    folder: <><path d="M3.5 7.2h5l1.6 2h10.4v8.1a2 2 0 0 1-2 2H5.5a2 2 0 0 1-2-2V7.2Z" /><path d="M3.5 7.2V6a2 2 0 0 1 2-2h3.2l1.7 2h8.1a2 2 0 0 1 2 2v1.2" /></>,
    broom: <><path d="m14.5 4.5 5 5" /><path d="m12.8 6.2 5 5-3.3 3.3-5-5 3.3-3.3Z" /><path d="M9.5 9.5 5 17.8c-.4.8.4 1.6 1.2 1.2l8.3-4.5" /></>,
    search: <><circle cx="10.8" cy="10.8" r="6.3" /><path d="m15.5 15.5 4.2 4.2" /></>,
    chart: <><path d="M4 19V5" /><path d="M4 19h16" /><path d="M7.5 15.5v-4" /><path d="M11.8 15.5V8.8" /><path d="M16.1 15.5v-6" /></>,
    eye: <><path d="M2.8 12s3.3-5.6 9.2-5.6 9.2 5.6 9.2 5.6-3.3 5.6-9.2 5.6S2.8 12 2.8 12Z" /><circle cx="12" cy="12" r="2.5" /></>,
    clock: <><circle cx="12" cy="12" r="8.4" /><path d="M12 7.4V12l3 1.8" /></>,
    pen: <><path d="m4 20 4.2-1 10.6-10.6a2.1 2.1 0 0 0-3-3L5.2 16 4 20Z" /><path d="m14.2 6.8 3 3" /></>,
    image: <><rect x="3.5" y="4.5" width="17" height="15" rx="2.5" /><circle cx="8.5" cy="9" r="1.4" /><path d="m4.5 17 5.2-5.2 3.4 3.4 2.3-2.3 4.1 4.1" /></>,
    pdf: <><path d="M6 3.5h7l5 5V20a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1Z" /><path d="M13 3.5v5h5" /><path d="M8.5 16.5v-3h1.2a1.4 1.4 0 0 1 0 2.8H8.5" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.6v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" /></>,
    spark: <path d="M12 2.8c.5 4.7 2.5 6.7 7.2 7.2-4.7.5-6.7 2.5-7.2 7.2-.5-4.7-2.5-6.7-7.2-7.2 4.7-.5 6.7-2.5 7.2-7.2Z" />,
    home: <><path d="m3.5 11 8.5-7 8.5 7" /><path d="M5.5 9.7V20h13V9.7" /><path d="M9.7 20v-5.5h4.6V20" /></>,
    refresh: <><path d="M19.5 8.5A8 8 0 1 0 20 13" /><path d="M19.5 3.8v4.7h-4.7" /></>,
    palette: <><path d="M12 3.5a8.5 8.5 0 0 0 0 17c1.4 0 1.9-1 1.9-2 0-.7.5-1.2 1.2-1.2h1.1a4.3 4.3 0 0 0 4.3-4.3A8.5 8.5 0 0 0 12 3.5Z" /><circle cx="7.5" cy="10" r=".8" /><circle cx="10" cy="7.2" r=".8" /><circle cx="14" cy="7.2" r=".8" /><circle cx="16.4" cy="10" r=".8" /></>,
    history: <><path d="M3.8 12a8.2 8.2 0 1 0 2.6-6" /><path d="M3.4 3.6v4.6h4.6" /><path d="M12 7.6V12l3 1.8" /></>,
    chevronLeft: <path d="m14.5 5.5-6.5 6.5 6.5 6.5" />,
    chevronRight: <path d="m9.5 5.5 6.5 6.5-6.5 6.5" />,
    info: <><circle cx="12" cy="12" r="8.5" /><path d="M12 10.5v5" /><path d="M12 7.7h.01" /></>,
    bolt: <path d="m13.2 2.8-7 10.4h5.2l-.6 8 7-10.4h-5.2l.6-8Z" />,
    menu: <><path d="M4 7h16" /><path d="M4 12h16" /><path d="M4 17h16" /></>,
    compare: <><path d="M4 7.5h11" /><path d="m12 4.5 3 3-3 3" /><path d="M20 16.5H9" /><path d="m12 13.5-3 3 3 3" /></>,
    archive: <><rect x="3.5" y="4.5" width="17" height="4.6" rx="1.4" /><path d="M5.2 9.1V19a1.5 1.5 0 0 0 1.5 1.5h10.6A1.5 1.5 0 0 0 18.8 19V9.1" /><path d="M10 13.4h4" /></>,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {paths[name]}
    </svg>
  );
}

/* A panel whose only job is to name the next step. The icon carries the tool's
   identity, the action is the same one the header would offer, and the hint
   sits below the fold of the sentence so the copy never reads as a dead end. */
function EmptyState({
  icon,
  title,
  body,
  hint,
  children,
}: {
  icon: IconName;
  title: string;
  body?: string;
  hint?: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-state-icon" aria-hidden="true"><Icon name={icon} size={20} /></span>
      <h2>{title}</h2>
      {body && <p>{body}</p>}
      {children && <div className="empty-state-actions">{children}</div>}
      {hint && <p className="empty-state-hint">{hint}</p>}
    </div>
  );
}

/* One filter box shared by every list, so Ctrl+F always focuses the same
   control no matter which tab is open. */
function SearchBox({
  value,
  onChange,
  placeholder,
  clearLabel,
  inputRef,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
  clearLabel: string;
  inputRef?: { current: HTMLInputElement | null };
}) {
  return (
    <div className="search-box">
      <Icon name="search" size={14} />
      <input
        ref={inputRef}
        type="text"
        className="search-input"
        value={value}
        placeholder={placeholder}
        aria-label={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
      {value && (
        <button type="button" className="search-clear" onClick={() => onChange("")} aria-label={clearLabel}>
          ×
        </button>
      )}
    </div>
  );
}

type Phase = "idle" | "scanning" | "ready" | "sorting" | "done";
type ActiveTab = "sort" | "search" | "junk" | "dupes" | "disk" | "watch" | "schedule" | "history"
  | "compare" | "archive" | "renamer" | "images" | "pdf" | "settings";

/* The destination shelf falls back to the built-in categories until the backend answers. */
const CATEGORY_ORDER = [
  "documents", "images", "videos", "audio", "archives", "code", "data", "ebooks", "executables", "fonts", "others",
];

/* Shown until the settings map loads, so the shelf never reads as empty rows. */
const CATEGORY_SAMPLE: Record<string, string[]> = {
  documents: ["pdf", "docx", "txt"],
  images: ["jpg", "png", "webp"],
  videos: ["mp4", "mkv", "mov"],
  audio: ["mp3", "flac", "wav"],
  archives: ["zip", "rar", "7z"],
  code: ["js", "ts", "py"],
  data: ["csv", "json", "db"],
  ebooks: ["epub", "mobi", "azw3"],
  executables: ["exe", "dmg", "msi"],
  fonts: ["ttf", "otf", "woff2"],
  others: ["log", "bak", "tmp"],
};

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

function baseName(path: string): string {
  const parts = path.split("/");
  return parts[parts.length - 1] || path;
}

/** The undo journal is the single source of truth for the history view. */
async function fetchHistory(): Promise<HistoryEntry[]> {
  return invoke<HistoryEntry[]>("get_history", { limit: 50 });
}

export default function App() {
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem("fs_theme") as Theme | null;
    if (saved && ["fluent", "dark", "light", "aurora", "sunset"].includes(saved)) {
      return saved;
    }
    return "fluent";
  });

  const [sidebarExpanded, setSidebarExpanded] = useState<boolean>(() => {
    return localStorage.getItem("fs_sidebar_expanded") !== "false";
  });
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const [lang, setLang] = useState<Locale>(() => detectInitialLocale());
  const t = getStrings(lang);
  const isRtl = lang === "fa";

  const toggleSidebar = () => {
    setSidebarExpanded((prev) => {
      const next = !prev;
      localStorage.setItem("fs_sidebar_expanded", String(next));
      return next;
    });
  };

  const [activeTab, setActiveTab] = useState<ActiveTab>("sort");
  const [phase, setPhase] = useState<Phase>("idle");
  const [folder, setFolder] = useState<string>("");
  const [scan, setScan] = useState<ScanProgress | null>(null);
  const [plan, setPlan] = useState<SortPlan | null>(null);
  const [showMoves, setShowMoves] = useState<boolean>(false);

  // Filtering, column sorting and drag & drop
  const [search, setSearch] = useState("");
  const [planSortKey, setPlanSortKey] = useState<"source" | "destination" | "category" | "size">("source");
  const [planSortDir, setPlanSortDir] = useState<"asc" | "desc">("asc");
  const [diskSortKey, setDiskSortKey] = useState<"name" | "size" | "path">("size");
  const [diskSortDir, setDiskSortDir] = useState<"asc" | "desc">("desc");
  const [dragging, setDragging] = useState(false);
  const [dropped, setDropped] = useState<DroppedPaths | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);

  // Duplicates state
  const [dupes, setDupes] = useState<DuplicateGroup[]>([]);
  const [dupeBusy, setDupeBusy] = useState(false);
  const [dupeKeep, setDupeKeep] = useState<"oldest" | "newest">("oldest");
  const [quarantineReport, setQuarantineReport] = useState<ExecReport | null>(null);

  // Disk space stats & drives
  const [diskStats, setDiskStats] = useState<DiskStats | null>(null);
  const [drives, setDrives] = useState<DriveInfo[]>([]);
  const [loadingDisk, setLoadingDisk] = useState(false);

  // Junk Cleaner state
  const [junkLocs, setJunkLocs] = useState<JunkLocation[]>([]);
  const [selectedJunk, setSelectedJunk] = useState<Set<string>>(new Set());
  const [junkBusy, setJunkBusy] = useState(false);
  const [cleanReport, setCleanReport] = useState<CleanReport | null>(null);

  // Empty folders & zero-byte files
  const [extrasRoot, setExtrasRoot] = useState("");
  const [extrasScan, setExtrasScan] = useState<ExtrasScan | null>(null);
  const [extrasBusy, setExtrasBusy] = useState(false);
  const [extrasReport, setExtrasReport] = useState<ExtrasReport | null>(null);
  const [extrasPick, setExtrasPick] = useState<{ dirs: boolean; files: boolean }>({ dirs: true, files: true });

  // Operation history, read from the undo journal
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  // Watch Mode state
  const [watchActive, setWatchActive] = useState<boolean>(false);
  const [watchFolders, setWatchFolders] = useState<string[]>([]);
  const [watchEvents, setWatchEvents] = useState<WatchEventPayload[]>([]);

  // Scheduler state
  const [tasks, setTasks] = useState<ScheduledTask[]>([]);
  const [taskHistory, setTaskHistory] = useState<TaskRunResult[]>([]);
  const [showAddTask, setShowAddTask] = useState(false);
  const [newTaskName, setNewTaskName] = useState("");
  const [newTaskKind, setNewTaskKind] = useState<"junk" | "sort">("junk");
  const [newTaskFolder, setNewTaskFolder] = useState("");
  const [newTaskInterval, setNewTaskInterval] = useState(60);

  // Smart Rules state
  const [smartRules, setSmartRules] = useState<SmartRule[]>([]);
  const [newRuleName, setNewRuleName] = useState("");
  const [newRuleCategory, setNewRuleCategory] = useState("documents");
  const [newRuleKeywords, setNewRuleKeywords] = useState("");

  // Settings
  const [categories, setCategories] = useState<CategoryMap>({});
  const [newExts, setNewExts] = useState<Record<string, string>>({});
  const [settingsNotice, setSettingsNotice] = useState<string>("");

  // Onboarding & Update modals
  const [onboardingOpen, setOnboardingOpen] = useState<boolean>(() => {
    return localStorage.getItem("filesorter_onboarded") === null;
  });
  const [updateModalOpen, setUpdateModalOpen] = useState(false);
  const [updateData, setUpdateData] = useState<UpdateCheckResult | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);

  // Reports & Error
  const [report, setReport] = useState<ExecReport | null>(null);
  const [undoReport, setUndoReport] = useState<UndoReport | null>(null);
  const [error, setError] = useState<string>("");
  const unlisteners = useRef<UnlistenFn[]>([]);

  const fmtNum = (n: number) => n.toLocaleString(isRtl ? "fa-IR" : "en-US");
  const getCatLabel = (cat: string) => getCategoryLabel(lang, cat);
  const histKind = (kind: string) =>
    kind === "quarantine" ? t.hist_kind_quarantine : kind === "extras" ? t.hist_kind_extras : t.hist_kind_sort;
  const loadHistory = useCallback(async () => {
    try {
      setHistory(await fetchHistory());
    } catch {
      // The history view is informative; a read failure must not block the app.
    }
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("fs_theme", theme);
  }, [theme]);

  useEffect(() => {
    document.body.classList.toggle("nav-open", mobileNavOpen);
    return () => document.body.classList.remove("nav-open");
  }, [mobileNavOpen]);

  useEffect(() => {
    document.documentElement.setAttribute("lang", lang);
    document.documentElement.setAttribute("dir", isRtl ? "rtl" : "ltr");
    document.documentElement.setAttribute("data-lang", lang);
    localStorage.setItem("fs_lang", lang);
  }, [lang, isRtl]);

  const closeOnboarding = () => {
    localStorage.setItem("filesorter_onboarded", "true");
    setOnboardingOpen(false);
  };

  // Check for updates on startup
  const checkForUpdates = useCallback(async (manual = false) => {
    setCheckingUpdate(true);
    try {
      const res = await invoke<UpdateCheckResult>("check_app_updates");
      setUpdateData(res);
      if (res.has_update) {
        setUpdateModalOpen(true);
      } else if (manual) {
        alert(t.update_latest);
      }
    } catch (e) {
      if (manual) {
        console.error("Update check failed", e);
      }
    } finally {
      setCheckingUpdate(false);
    }
  }, [t]);

  useEffect(() => {
    checkForUpdates(false);
  }, [checkForUpdates]);

  // Load initial settings, smart rules, watch state, and scheduled tasks
  useEffect(() => {
    invoke<CategoryMap>("get_categories")
      .then(setCategories)
      .catch(() => {});
    invoke<SmartRule[]>("get_smart_rules")
      .then(setSmartRules)
      .catch(() => {});
    invoke<WatchStatus>("watch_get_status")
      .then((st) => {
        setWatchActive(st.active);
        setWatchFolders(st.folders);
        setWatchEvents(st.recent_events);
      })
      .catch(() => {});
    invoke<ScheduledTask[]>("get_scheduled_tasks")
      .then(setTasks)
      .catch(() => {});
    invoke<TaskRunResult[]>("get_task_history")
      .then(setTaskHistory)
      .catch(() => {});
    invoke<DriveInfo[]>("list_system_drives")
      .then(setDrives)
      .catch(() => {});
    fetchHistory().then(setHistory).catch(() => {});
  }, []);

  // Event Listeners (Scan, Dupes, Sort, Quarantine, Undo, Watch, Schedule)
  useEffect(() => {
    let scanRafId: number | null = null;
    let latestScan: ScanProgress | null = null;
    let cancelled = false;

    const setupListeners = async () => {
      const registered: Array<() => void> = [];
      // Registration is async; if the component unmounts before the last
      // `listen` resolves, the old code stored the handles into an array the
      // cleanup had already cleared, leaking every listener (duplicate events
      // in StrictMode, events doubling after a remount).
      const keep = (unlisten: () => void) => {
        if (cancelled) unlisten();
        else registered.push(unlisten);
      };

      keep(await listen<ScanProgress>("scan-progress", (ev) => {
        latestScan = ev.payload;
        if (scanRafId === null) {
          scanRafId = requestAnimationFrame(() => {
            if (latestScan) setScan(latestScan);
            scanRafId = null;
          });
        }
      }));
      keep(await listen<{ stopped?: boolean; error?: string }>("scan-done", (ev) => {
        if (scanRafId !== null) {
          cancelAnimationFrame(scanRafId);
          scanRafId = null;
        }
        if (ev.payload.error) {
          setError(ev.payload.error);
          setPhase("idle");
        } else if (ev.payload.stopped) {
          setPhase("idle");
        } else {
          setPhase("ready");
        }
      }));
      keep(await listen<{ groups?: DuplicateGroup[]; error?: string }>("dupes-done", (ev) => {
        setDupeBusy(false);
        if (ev.payload.error) {
          setError(ev.payload.error);
        } else if (ev.payload.groups) {
          setDupes(ev.payload.groups);
        }
      }));
      keep(await listen<{ report?: ExecReport; error?: string }>("sort-done", (ev) => {
        if (ev.payload.error) {
          setError(ev.payload.error);
          // Keep the plan on screen: marking the run "done" without a report
          // hid both the review list and the results card, leaving no way to
          // retry after a failed sort.
          setPhase("ready");
        } else if (ev.payload.report) {
          setReport(ev.payload.report);
          setPhase("done");
          void fetchHistory().then(setHistory).catch(() => {});
        }
      }));
      keep(await listen<{ report?: ExecReport; error?: string }>("quarantine-done", (ev) => {
        setDupeBusy(false);
        if (ev.payload.error) {
          setError(ev.payload.error);
        } else if (ev.payload.report) {
          setQuarantineReport(ev.payload.report);
          setDupes([]);
          void fetchHistory().then(setHistory).catch(() => {});
        }
      }));
      keep(await listen<{ report?: UndoReport; error?: string }>("undo-done", (ev) => {
        if (ev.payload.error) {
          setError(ev.payload.error);
        } else if (ev.payload.report) {
          setUndoReport(ev.payload.report);
          void fetchHistory().then(setHistory).catch(() => {});
        }
      }));
      keep(await listen<WatchEventPayload>("watch-event", (ev) => {
        setWatchEvents((prev) => [ev.payload, ...prev].slice(0, 100));
      }));
      keep(await listen<TaskRunResult>("scheduled-task-done", (ev) => {
        setTaskHistory((prev) => [ev.payload, ...prev].slice(0, 50));
        // refresh tasks to show updated last_run
        invoke<ScheduledTask[]>("get_scheduled_tasks")
          .then(setTasks)
          .catch(() => {});
      }));

      if (!cancelled) unlisteners.current = registered;
    };

    setupListeners();

    return () => {
      cancelled = true;
      if (scanRafId !== null) cancelAnimationFrame(scanRafId);
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

  // Used by the dialog and by drag & drop: both end in the same scan.
  const startWithFolder = useCallback(
    (picked: string) => {
      setError("");
      reset();
      setActiveTab("sort");
      setFolder(picked);
      setPhase("scanning");
      setScan({ total_so_far: 0, bytes_so_far: 0, batch_files: 0, done: false });
      invoke("scan_start", { root: picked }).catch((e) => {
        setError(String(e));
        setPhase("idle");
      });
    },
    [reset]
  );

  const pickFolder = useCallback(async () => {
    const picked = await invoke<string | null>("pick_folder");
    if (!picked) return;
    startWithFolder(picked);
  }, [startWithFolder]);

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

  const undoLast = useCallback(async () => {
    setError("");
    try {
      await invoke("undo_last");
    } catch (e) {
      setError(String(e));
    }
  }, []);

  // Junk Cleaner handlers
  // Refreshes the location list without touching the busy flag or the result
  // card, so a post-cleanup refresh cannot wipe the summary the user just got.
  const refreshJunk = async () => {
    const locs = await invoke<JunkLocation[]>("scan_junk");
    setJunkLocs(locs);
    setSelectedJunk(new Set(locs.map((l) => l.id)));
  };

  const handleScanJunk = async () => {
    setJunkBusy(true);
    setError("");
    setCleanReport(null);
    try {
      await refreshJunk();
    } catch (e) {
      setError(String(e));
    } finally {
      setJunkBusy(false);
    }
  };

  const handleCleanJunk = async () => {
    if (selectedJunk.size === 0) return;
    setJunkBusy(true);
    setError("");
    try {
      const rep = await invoke<CleanReport>("clean_junk", {
        selectedIds: Array.from(selectedJunk),
      });
      setCleanReport(rep);
      await refreshJunk();
    } catch (e) {
      setError(String(e));
    } finally {
      setJunkBusy(false);
    }
  };

  const toggleJunkSelection = (id: string) => {
    setSelectedJunk((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // ── Empty folders & zero-byte files ────────────────────────────────
  const handleScanExtras = async () => {
    setError("");
    try {
      const picked = await invoke<string | null>("pick_folder");
      if (!picked) return;
      setExtrasBusy(true);
      setExtrasReport(null);
      const scan = await invoke<ExtrasScan>("scan_extras", { root: picked });
      setExtrasRoot(scan.root);
      setExtrasScan(scan);
      setExtrasPick({ dirs: true, files: true });
    } catch (e) {
      setError(String(e));
    } finally {
      setExtrasBusy(false);
    }
  };

  const handleCleanExtras = async () => {
    if (!extrasScan || extrasCount === 0) return;
    setError("");
    setExtrasBusy(true);
    try {
      const result = await invoke<ExtrasReport>("clean_extras", {
        root: extrasRoot,
        dirs: extrasPick.dirs ? extrasScan.empty_dirs : [],
        files: extrasPick.files ? extrasScan.empty_files : [],
      });
      setExtrasReport(result);
      // Re-scan: removing a folder can leave its parent empty, and that parent
      // now belongs on the list too.
      setExtrasScan(await invoke<ExtrasScan>("scan_extras", { root: extrasRoot }));
      await loadHistory();
    } catch (e) {
      setError(String(e));
    } finally {
      setExtrasBusy(false);
    }
  };

  // Watch Mode handlers
  const handleToggleWatch = async () => {
    try {
      const nextState = !watchActive;
      const res = await invoke<boolean>("watch_set_active", { active: nextState });
      setWatchActive(res);
    } catch (e) {
      setError(String(e));
    }
  };

  const handleAddWatchFolder = async () => {
    const picked = await invoke<string | null>("pick_folder");
    if (!picked) return;
    try {
      const updated = await invoke<string[]>("watch_add_folder", { folder: picked });
      setWatchFolders(updated);
    } catch (e) {
      setError(String(e));
    }
  };

  const handleRemoveWatchFolder = async (f: string) => {
    try {
      const updated = await invoke<string[]>("watch_remove_folder", { folder: f });
      setWatchFolders(updated);
    } catch (e) {
      setError(String(e));
    }
  };

  // Scheduled Tasks handlers
  const handleSaveTask = async () => {
    if (!newTaskName.trim()) return;
    const task: ScheduledTask = {
      id: `task_${Date.now()}`,
      name: newTaskName.trim(),
      kind: newTaskKind,
      folder: newTaskKind === "sort" ? newTaskFolder || null : null,
      interval_minutes: Number(newTaskInterval) || 60,
      enabled: true,
      last_run: null,
    };
    try {
      await invoke("save_scheduled_task", { task });
      setTasks((prev) => [...prev, task]);
      setShowAddTask(false);
      setNewTaskName("");
      setNewTaskFolder("");
    } catch (e) {
      setError(String(e));
    }
  };

  const handleDeleteTask = async (id: string) => {
    try {
      await invoke("delete_scheduled_task", { id });
      setTasks((prev) => prev.filter((t) => t.id !== id));
    } catch (e) {
      setError(String(e));
    }
  };

  const handleRunTaskNow = async (id: string) => {
    try {
      const res = await invoke<string>("run_scheduled_task_now", { id });
      alert(fmt(t.sched_task_executed, { summary: res }));
    } catch (e) {
      setError(String(e));
    }
  };

  // Smart Rules handlers
  const handleAddSmartRule = async () => {
    if (!newRuleName.trim() || !newRuleKeywords.trim()) return;
    const kws = newRuleKeywords
      .split(",")
      .map((k) => k.trim())
      .filter((k) => k.length > 0);
    const rule: SmartRule = {
      id: `rule_${Date.now()}`,
      name: newRuleName.trim(),
      category: newRuleCategory,
      keywords: kws,
    };
    const updated = [...smartRules, rule];
    try {
      await invoke("save_smart_rules", { rules: updated });
      setSmartRules(updated);
      setNewRuleName("");
      setNewRuleKeywords("");
      setSettingsNotice(t.notice_rule_added);
      setTimeout(() => setSettingsNotice(""), 3000);
    } catch (e) {
      setError(String(e));
    }
  };

  const handleDeleteSmartRule = async (id: string) => {
      const updated = smartRules.filter((r) => r.id !== id);
    try {
      await invoke("save_smart_rules", { rules: updated });
      setSmartRules(updated);
      setSettingsNotice(t.notice_rule_deleted);
      setTimeout(() => setSettingsNotice(""), 3000);
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

  // ── Filtered & sorted views ────────────────────────────────────────
  const togglePlanSort = (key: typeof planSortKey) => {
    if (planSortKey === key) setPlanSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setPlanSortKey(key);
      setPlanSortDir("asc");
    }
  };

  const planRows = useMemo(() => {
    const rows = plan?.moves ?? [];
    const q = search.trim().toLowerCase();
    const filtered = q
      ? rows.filter((m) => `${m.source} ${m.destination} ${m.category}`.toLowerCase().includes(q))
      : rows;
    const sorted = [...filtered].sort((a, b) => {
      const cmp =
        planSortKey === "size"
          ? a.size - b.size
          : planSortKey === "category"
            ? a.category.localeCompare(b.category)
            : planSortKey === "destination"
              ? a.destination.localeCompare(b.destination)
              : a.source.localeCompare(b.source);
      return planSortDir === "asc" ? cmp : -cmp;
    });
    return sorted.slice(0, 100);
  }, [plan, search, planSortKey, planSortDir]);

  const dupeGroups = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = q ? dupes.filter((g) => g.files.some((f) => f.path.toLowerCase().includes(q))) : dupes;
    return rows.slice(0, 50);
  }, [dupes, search]);

  const toggleDiskSort = (key: typeof diskSortKey) => {
    if (diskSortKey === key) setDiskSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setDiskSortKey(key);
      setDiskSortDir("asc");
    }
  };

  const diskRows = useMemo(() => {
    const rows = diskStats?.largest_files ?? [];
    const q = search.trim().toLowerCase();
    const filtered = q ? rows.filter(([filePath]) => filePath.toLowerCase().includes(q)) : rows;
    const sorted = [...filtered].sort((a, b) => {
      const cmp =
        diskSortKey === "size"
          ? a[1] - b[1]
          : diskSortKey === "path"
            ? a[0].localeCompare(b[0])
            : baseName(a[0]).localeCompare(baseName(b[0]));
      return diskSortDir === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [diskStats, search, diskSortKey, diskSortDir]);

  const historyRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return history;
    // `histKind` follows the active locale, hence `lang` in the deps below.
    return history.filter((h) => `${histKind(h.kind)} ${h.kind} ${h.op_id}`.toLowerCase().includes(q));
  }, [history, search, lang]);

  const extrasCount = extrasScan
    ? (extrasPick.dirs ? extrasScan.empty_dirs.length : 0) + (extrasPick.files ? extrasScan.empty_files.length : 0)
    : 0;

  // A new tab starts with an empty filter; keeping it would silently hide rows.
  useEffect(() => {
    setSearch("");
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === "history") void loadHistory();
  }, [activeTab, loadHistory]);

  // Drag & drop: a folder starts a scan, files go to the open tool. The handler
  // lives in a ref so the Tauri listener is registered once per app lifetime.
  const dropHandler = useRef<(paths: string[]) => void>(() => {});
  dropHandler.current = async (paths: string[]) => {
    if (paths.length === 0) return;
    let directories: string[] = [];
    let files: string[] = [];
    let parent: string | null = null;
    try {
      const split = await invoke<{ directories: string[]; files: string[]; parent: string | null }>(
        "classify_dropped",
        { paths }
      );
      directories = split.directories;
      files = split.files;
      parent = split.parent;
    } catch (e) {
      setError(String(e));
      return;
    }
    if (activeTab === "renamer" || activeTab === "images" || activeTab === "pdf") {
      if (files.length === 0) {
        setError(t.drop_needs_files);
        return;
      }
      setDropped({ paths: files, seq: Date.now() });
      return;
    }
    // These tools take a drop without taking over the scan flow: a folder
    // dropped here must not jump the user back to the sort tab.
    if (activeTab === "search" || activeTab === "compare") {
      const folder = directories[0] ?? parent;
      if (folder) setDropped({ paths: [folder], seq: Date.now() });
      return;
    }
    if (activeTab === "archive") {
      const items = [...directories, ...files];
      if (items.length > 0) setDropped({ paths: items, seq: Date.now() });
      return;
    }
    const root = directories[0] ?? parent;
    if (root) startWithFolder(root);
  };

  useEffect(() => {
    let disposed = false;
    let unlisten: UnlistenFn | null = null;
    (async () => {
      try {
        const { getCurrentWebview } = await import("@tauri-apps/api/webview");
        const un = await getCurrentWebview().onDragDropEvent((event) => {
          const payload = event.payload;
          if (payload.type === "over") {
            setDragging(true);
          } else if (payload.type === "leave") {
            setDragging(false);
          } else if (payload.type === "drop") {
            setDragging(false);
            dropHandler.current("paths" in payload ? payload.paths : []);
          }
        });
        if (disposed) un();
        else unlisten = un;
      } catch (e) {
        console.error("Drag & drop is unavailable", e);
      }
    })();
    return () => {
      disposed = true;
      if (unlisten) unlisten();
    };
  }, []);

  // Keyboard: Ctrl+O picks a folder, Ctrl+F filters, Ctrl+Z undoes, Esc closes.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const el = event.target as HTMLElement | null;
      const typing =
        !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
      const mod = event.ctrlKey || event.metaKey;
      if (mod && event.key.toLowerCase() === "o") {
        event.preventDefault();
        void pickFolder();
        return;
      }
      if (mod && event.key.toLowerCase() === "f") {
        event.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
        return;
      }
      if (mod && event.key.toLowerCase() === "z" && !typing) {
        event.preventDefault();
        void undoLast();
        return;
      }
      if (event.key === "Escape") {
        if (showAddTask) setShowAddTask(false);
        else if (onboardingOpen) closeOnboarding();
        else if (mobileNavOpen) setMobileNavOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pickFolder, undoLast, showAddTask, onboardingOpen, mobileNavOpen]);

  const pct = (part: number, total: number) => (total > 0 ? ((part / total) * 100).toFixed(1) : "0");

  return (
    <div className={`app-layout ${sidebarExpanded ? "sidebar-expanded" : "sidebar-collapsed"}`}>
      {/* Onboarding Modal */}
      <OnboardingModal
        isOpen={onboardingOpen}
        onClose={closeOnboarding}
        currentTheme={theme}
        onSelectTheme={setTheme}
        onPickFolder={pickFolder}
        lang={lang}
      />

      {/* Auto-Update Modal */}
      <UpdateModal
        isOpen={updateModalOpen}
        onClose={() => setUpdateModalOpen(false)}
        updateData={updateData}
        lang={lang}
      />

      {dragging && (
        <div className="drop-overlay" aria-hidden="true">
          <div className="drop-overlay-card">
            <Icon name="drop" size={26} />
            <b>{t.drop_overlay_title}</b>
            <span>{t.drop_overlay_body}</span>
          </div>
        </div>
      )}

      {/* Left sidebar: one ground with the canvas, a single rule between. */}
      <button
        type="button"
        className="nav-scrim"
        aria-label={t.sidebar_collapse}
        onClick={() => setMobileNavOpen(false)}
      />
      <aside className="sidebar-glass" aria-label={t.nav_aria}>
        <div className="sidebar-header">
          <div className="sidebar-brand">
            <span className="sidebar-brand-icon"><Icon name="folder" size={17} /></span>
            {sidebarExpanded && (
              <div className="sidebar-title-group">
                <span className="sidebar-title">{t.app_title}</span>
                <span className="sidebar-badge">v{__APP_VERSION__}</span>
              </div>
            )}
          </div>
          <button
            type="button"
            className="sidebar-toggle-btn"
            onClick={toggleSidebar}
            title={sidebarExpanded ? t.sidebar_collapse : t.sidebar_expand}
            aria-label={sidebarExpanded ? t.sidebar_collapse : t.sidebar_expand}
          >
            <Icon name={sidebarExpanded ? "chevronLeft" : "chevronRight"} size={15} />
          </button>
        </div>

        {/* Navigation */}
        <nav className="sidebar-nav" onClick={() => setMobileNavOpen(false)}>
          <div className="nav-group" role="group" aria-label={t.nav_group_organize}>
            <span className="nav-group-label">{t.nav_group_organize}</span>
            <button
              type="button"
              className={`sidebar-tab ${activeTab === "sort" ? "active" : ""}`}
              onClick={() => setActiveTab("sort")}
              title={t.tab_sort}
              aria-current={activeTab === "sort" ? "page" : undefined}
            >
              <span className="sidebar-tab-icon"><Icon name="folder" /></span>
              {sidebarExpanded && <span className="sidebar-tab-label">{t.tab_sort}</span>}
            </button>
            <button
              type="button"
              className={`sidebar-tab ${activeTab === "search" ? "active" : ""}`}
              onClick={() => setActiveTab("search")}
              title={t.tab_search}
              aria-current={activeTab === "search" ? "page" : undefined}
            >
              <span className="sidebar-tab-icon"><Icon name="search" /></span>
              {sidebarExpanded && <span className="sidebar-tab-label">{t.tab_search}</span>}
            </button>
          </div>

          <div className="nav-group" role="group" aria-label={t.nav_group_clean}>
            <span className="nav-group-label">{t.nav_group_clean}</span>
            <button
              type="button"
              className={`sidebar-tab ${activeTab === "junk" ? "active" : ""}`}
              onClick={() => setActiveTab("junk")}
              title={t.tab_junk}
              aria-current={activeTab === "junk" ? "page" : undefined}
            >
              <span className="sidebar-tab-icon"><Icon name="broom" /></span>
              {sidebarExpanded && <span className="sidebar-tab-label">{t.tab_junk}</span>}
            </button>
            <button
              type="button"
              className={`sidebar-tab ${activeTab === "dupes" ? "active" : ""}`}
              onClick={() => setActiveTab("dupes")}
              title={t.tab_dupes}
              aria-current={activeTab === "dupes" ? "page" : undefined}
            >
              <span className="sidebar-tab-icon"><Icon name="search" /></span>
              {sidebarExpanded && <span className="sidebar-tab-label">{t.tab_dupes}</span>}
              {dupes.length > 0 && <span className="sidebar-tab-badge">{dupes.length}</span>}
            </button>
            <button
              type="button"
              className={`sidebar-tab ${activeTab === "disk" ? "active" : ""}`}
              onClick={() => setActiveTab("disk")}
              title={t.tab_disk}
              aria-current={activeTab === "disk" ? "page" : undefined}
            >
              <span className="sidebar-tab-icon"><Icon name="chart" /></span>
              {sidebarExpanded && <span className="sidebar-tab-label">{t.tab_disk}</span>}
            </button>
            <button
              type="button"
              className={`sidebar-tab ${activeTab === "watch" ? "active" : ""}`}
              onClick={() => setActiveTab("watch")}
              title={t.tab_watch}
              aria-current={activeTab === "watch" ? "page" : undefined}
            >
              <span className="sidebar-tab-icon"><Icon name="eye" /></span>
              {sidebarExpanded && <span className="sidebar-tab-label">{t.tab_watch}</span>}
              {watchActive && <span className="sidebar-tab-badge">ON</span>}
            </button>
          </div>

          <div className="nav-group" role="group" aria-label={t.nav_group_tools}>
            <span className="nav-group-label">{t.nav_group_tools}</span>
            <button
              type="button"
              className={`sidebar-tab ${activeTab === "schedule" ? "active" : ""}`}
              onClick={() => setActiveTab("schedule")}
              title={t.tab_schedule}
              aria-current={activeTab === "schedule" ? "page" : undefined}
            >
              <span className="sidebar-tab-icon"><Icon name="clock" /></span>
              {sidebarExpanded && <span className="sidebar-tab-label">{t.tab_schedule}</span>}
              {tasks.length > 0 && <span className="sidebar-tab-badge">{tasks.length}</span>}
            </button>
            <button
              type="button"
              className={`sidebar-tab ${activeTab === "history" ? "active" : ""}`}
              onClick={() => setActiveTab("history")}
              title={t.tab_history}
              aria-current={activeTab === "history" ? "page" : undefined}
            >
              <span className="sidebar-tab-icon"><Icon name="history" /></span>
              {sidebarExpanded && <span className="sidebar-tab-label">{t.tab_history}</span>}
            </button>
            <button
              type="button"
              className={`sidebar-tab ${activeTab === "compare" ? "active" : ""}`}
              onClick={() => setActiveTab("compare")}
              title={t.tab_compare}
              aria-current={activeTab === "compare" ? "page" : undefined}
            >
              <span className="sidebar-tab-icon"><Icon name="compare" /></span>
              {sidebarExpanded && <span className="sidebar-tab-label">{t.tab_compare}</span>}
            </button>
            <button
              type="button"
              className={`sidebar-tab ${activeTab === "archive" ? "active" : ""}`}
              onClick={() => setActiveTab("archive")}
              title={t.tab_archive}
              aria-current={activeTab === "archive" ? "page" : undefined}
            >
              <span className="sidebar-tab-icon"><Icon name="archive" /></span>
              {sidebarExpanded && <span className="sidebar-tab-label">{t.tab_archive}</span>}
            </button>
            <button
              type="button"
              className={`sidebar-tab ${activeTab === "renamer" ? "active" : ""}`}
              onClick={() => setActiveTab("renamer")}
              title={t.tab_renamer}
              aria-current={activeTab === "renamer" ? "page" : undefined}
            >
              <span className="sidebar-tab-icon"><Icon name="pen" /></span>
              {sidebarExpanded && <span className="sidebar-tab-label">{t.tab_renamer}</span>}
            </button>
            <button
              type="button"
              className={`sidebar-tab ${activeTab === "images" ? "active" : ""}`}
              onClick={() => setActiveTab("images")}
              title={t.tab_images}
              aria-current={activeTab === "images" ? "page" : undefined}
            >
              <span className="sidebar-tab-icon"><Icon name="image" /></span>
              {sidebarExpanded && <span className="sidebar-tab-label">{t.tab_images}</span>}
            </button>
            <button
              type="button"
              className={`sidebar-tab ${activeTab === "pdf" ? "active" : ""}`}
              onClick={() => setActiveTab("pdf")}
              title={t.tab_pdf}
              aria-current={activeTab === "pdf" ? "page" : undefined}
            >
              <span className="sidebar-tab-icon"><Icon name="pdf" /></span>
              {sidebarExpanded && <span className="sidebar-tab-label">{t.tab_pdf}</span>}
            </button>
          </div>

          <div className="nav-group nav-group-end">
            <button
              type="button"
              className={`sidebar-tab ${activeTab === "settings" ? "active" : ""}`}
              onClick={() => setActiveTab("settings")}
              title={t.tab_settings}
              aria-current={activeTab === "settings" ? "page" : undefined}
            >
              <span className="sidebar-tab-icon"><Icon name="settings" /></span>
              {sidebarExpanded && <span className="sidebar-tab-label">{t.tab_settings}</span>}
            </button>
          </div>
        </nav>

        {/* Bottom: Quick Action Controls & Theme Switcher */}
        <div className="sidebar-footer">
          {folder && (
            <button type="button" className="sidebar-action-btn" onClick={reset} title={t.reset_folder}>
              <span className="sidebar-tab-icon"><Icon name="refresh" /></span>
              {sidebarExpanded && <span className="sidebar-tab-label">{t.reset_folder}</span>}
            </button>
          )}
          {sidebarExpanded ? (
            <div className="theme-switcher-box">
              <div className="theme-switcher-header">
                <span className="theme-switcher-title">{t.theme_title}</span>
                <span className="theme-switcher-active-badge">
                  {themeMeta(t, theme).name}
                </span>
              </div>
              <div className="theme-dots" role="group" aria-label={t.theme_title}>
                {THEMES.map((th) => {
                  const meta = themeMeta(t, th.id);
                  return (
                    <button
                      key={th.id}
                      type="button"
                      className={`theme-dot ${theme === th.id ? "active" : ""}`}
                      onClick={() => setTheme(th.id)}
                      title={`${meta.name} — ${meta.desc}`}
                      aria-label={meta.name}
                      aria-pressed={theme === th.id}
                    >
                      <i className="theme-dot-ground" style={{ background: th.swatch[0] }} aria-hidden="true">
                        <b style={{ background: th.swatch[2] }} />
                      </i>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <button
              type="button"
              className="sidebar-action-btn"
              onClick={() => {
                const idx = THEMES.findIndex((x) => x.id === theme);
                setTheme(THEMES[(idx + 1) % THEMES.length].id);
              }}
              title={themeMeta(t, theme).name}
              aria-label={t.theme_title}
            >
              <span className="sidebar-tab-icon"><Icon name="palette" /></span>
            </button>
          )}
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="main-content-flow">
        <header className="top-banner-bar">
          <button
            type="button"
            className="mobile-nav-btn"
            onClick={() => setMobileNavOpen(true)}
            aria-label={t.nav_aria}
          >
            <Icon name="menu" size={18} />
          </button>
          <div className="banner-left">
            <div className="fluent-address-bar">
              <div className="fluent-nav-arrows">
                <button
                  type="button"
                  className="fluent-arrow-btn"
                  onClick={() => setActiveTab("sort")}
                  title={t.tab_sort}
                  aria-label={t.home_aria}
                >
                  <Icon name="home" size={16} />
                </button>
              </div>
              <div className="fluent-breadcrumb-pill">
                <span className="fluent-crumb-icon"><Icon name="drop" size={14} /></span>
                <span className="fluent-crumb-root">FileSorter</span>
                <span className="fluent-crumb-sep">›</span>
                <span className="fluent-crumb-current">
                  {activeTab === "sort" ? t.tab_sort :
                   activeTab === "search" ? t.tab_search :
                   activeTab === "compare" ? t.tab_compare :
                   activeTab === "archive" ? t.tab_archive :
                   activeTab === "junk" ? t.tab_junk :
                   activeTab === "dupes" ? t.tab_dupes :
                   activeTab === "disk" ? t.tab_disk :
                   activeTab === "watch" ? t.tab_watch :
                   activeTab === "schedule" ? t.tab_schedule :
                   activeTab === "renamer" ? t.tab_renamer :
                   activeTab === "images" ? t.tab_images :
                   activeTab === "pdf" ? t.tab_pdf :
                   activeTab === "history" ? t.tab_history : t.tab_settings}
                </span>
                {folder && (
                  <>
                    <span className="fluent-crumb-sep">›</span>
                    <span className="fluent-crumb-folder" title={folder}>{folder.split(/[\\/]/).pop()}</span>
                  </>
                )}
              </div>
            </div>
          </div>
          <div className="banner-right">
            <button
              type="button"
              className="btn btn-ghost btn-sm fluent-banner-btn lang-btn"
              onClick={() => setLang(isRtl ? "en" : "fa")}
              title={t.lang_switch_title}
              aria-label={t.lang_switch_title}
            >
              <span className="lang-label">{t.lang_switch_label}</span>
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm fluent-banner-btn"
              onClick={() => setOnboardingOpen(true)}
            >
              <Icon name="info" size={14} /> <span className="banner-btn-label">{t.onboarding_btn_tour}</span>
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm fluent-banner-btn"
              onClick={() => checkForUpdates(true)}
              disabled={checkingUpdate}
            >
              <Icon name="spark" size={14} />{" "}
              <span className="banner-btn-label">
                {checkingUpdate ? t.update_checking : updateData?.has_update ? t.update_available : t.update_check_btn}
              </span>
            </button>
          </div>
        </header>

        <div className="content-body">
          {error && (
            <div className="alert alert-error" role="alert">
              <span className="alert-label">Error</span>
              <span>{error}</span>
              <button className="alert-close" onClick={() => setError("")} aria-label="Dismiss">×</button>
            </div>
          )}

          {/* TAB 1: Organize / File Sorter */}
          {activeTab === "sort" && (
          <>
            <section className="glass sort-hero">
              <div className="page-header">
                <div className="page-heading">
                  <h1>{t.tab_sort}</h1>
                  <p className="page-sub">{t.hero_subtitle}</p>
                </div>
                {folder && (
                  <div className="page-actions">
                    <button className="btn btn-primary" onClick={pickFolder}>
                      {t.common_change}
                    </button>
                  </div>
                )}
              </div>

              {folder ? (
                <div className="folder-chip">
                  <span className="folder-icon"><Icon name="folder" size={15} /></span>
                  <span className="mono folder-path" title={folder}>{folder}</span>
                </div>
              ) : (
                <div className="sort-start">
                  <div
                    className="dropzone-liquid"
                    onClick={pickFolder}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        pickFolder();
                      }
                    }}
                  >
                    <div className="dropzone-icon"><Icon name="folder" size={26} /></div>
                    <h2>{t.hero_title}</h2>
                    <p>{t.dropzone_hint}</p>
                    <button
                      className="btn btn-primary"
                      onClick={(e) => {
                        e.stopPropagation();
                        pickFolder();
                      }}
                    >
                      {t.hero_drop_btn}
                    </button>
                  </div>
                  <aside className="category-preview">
                    <h2>{t.sort_flow_title}</h2>
                    <p>{t.sort_flow_desc}</p>
                    <div className="shelf-list">
                      {(Object.keys(categories).length > 0 ? Object.keys(categories) : CATEGORY_ORDER).map((cat) => (
                        <div key={cat} className="shelf-row">
                          <span className="shelf-name">
                            <span className="cat-dot" data-cat={cat} aria-hidden="true" />
                            {getCatLabel(cat)}
                          </span>
                          <span className="shelf-ext">
                            {((categories[cat]?.length ? categories[cat] : CATEGORY_SAMPLE[cat]) ?? []).slice(0, 3).map((e) => `.${e}`).join(" ")}
                          </span>
                        </div>
                      ))}
                    </div>
                  </aside>
                </div>
              )}

              {phase === "scanning" && scan && (
                <div className="scan-status">
                  <div className="scan-metrics">
                    <span className="pulse-dot" />
                    <span><b>{fmtNum(scan.total_so_far)}</b> {t.hero_files_found}</span>
                    <span className="muted mono">({formatBytes(scan.bytes_so_far)})</span>
                  </div>
                  <div className="scan-controls">
                    <div className="meter"><div className="meter-fill indeterminate" /></div>
                    <button className="btn btn-ghost btn-sm" onClick={stopScan}>{t.hero_stop}</button>
                  </div>
                </div>
              )}
            </section>

            {plan && phase !== "done" && (
              <section className="glass plan-review">
                <div className="summary">
                  <div className="stat"><b>{fmtNum(plan.total_moves ?? plan.moves.length)}</b><span>{t.summary_files}</span></div>
                  <div className="stat"><b>{formatBytes(plan.total_size)}</b><span>{t.summary_size}</span></div>
                  <div className="stat"><b>{plan.counts.length}</b><span>{t.summary_categories}</span></div>
                </div>

                <div className="category-chips">
                  {plan.counts.map(([cat, count]) => (
                    <span key={cat} className="cat-chip">
                      <span className="cat-dot" data-cat={cat} aria-hidden="true" />
                      <span className="cat-name">{getCatLabel(cat)}</span>
                      <span className="cat-count mono">{fmtNum(count)}</span>
                    </span>
                  ))}
                </div>

                <div className="actions">
                  <button className="btn btn-primary btn-large" onClick={executeSort} disabled={phase === "sorting" || (plan.total_moves ?? plan.moves.length) === 0}>
                    {phase === "sorting" ? t.btn_sorting : t.btn_sort_now}
                  </button>
                  <button className="btn btn-ghost" onClick={() => setShowMoves(!showMoves)}>
                    {showMoves ? t.btn_hide_moves : t.btn_show_moves}
                  </button>
                  <button className="btn btn-ghost" onClick={loadResults}>{t.btn_rescan}</button>
                </div>

                {showMoves && (
                  <div className="table-container" style={{ marginTop: "16px" }}>
                    <div className="list-toolbar">
                      <SearchBox
                        value={search}
                        onChange={setSearch}
                        placeholder={t.search_placeholder}
                        clearLabel={t.search_clear}
                        inputRef={searchRef}
                      />
                      <span className="muted" style={{ fontSize: "12px" }}>
                        {fmt(t.search_count, { shown: fmtNum(planRows.length), total: fmtNum(plan.moves.length) })}
                      </span>
                    </div>
                    {plan.total_moves && plan.total_moves > plan.moves.length && (
                      <p className="muted" style={{ fontSize: "12px", margin: "0 0 10px 4px" }}>
                        {fmt(t.preview_note, {
                          shown: fmtNum(planRows.length),
                          total: fmtNum(plan.total_moves),
                        })}
                      </p>
                    )}
                    <table>
                      <thead>
                        <tr>
                          <th>
                            <button type="button" className="th-sort" onClick={() => togglePlanSort("source")}>
                              {t.col_source}
                              {planSortKey === "source" ? (planSortDir === "asc" ? " ▲" : " ▼") : ""}
                            </button>
                          </th>
                          <th>
                            <button type="button" className="th-sort" onClick={() => togglePlanSort("destination")}>
                              {t.col_destination}
                              {planSortKey === "destination" ? (planSortDir === "asc" ? " ▲" : " ▼") : ""}
                            </button>
                          </th>
                          <th>
                            <button type="button" className="th-sort" onClick={() => togglePlanSort("category")}>
                              {t.col_category}
                              {planSortKey === "category" ? (planSortDir === "asc" ? " ▲" : " ▼") : ""}
                            </button>
                          </th>
                          <th>
                            <button type="button" className="th-sort" onClick={() => togglePlanSort("size")}>
                              {t.col_size}
                              {planSortKey === "size" ? (planSortDir === "asc" ? " ▲" : " ▼") : ""}
                            </button>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {planRows.map((m, i) => (
                          <tr key={i}>
                            <td className="mono ellipsis">{m.source.split(/[\\/]/).pop()}</td>
                            <td className="mono ellipsis">{m.destination.replace(plan.root, "")}</td>
                            <td>
                              <span className="cat-cell" data-cat={m.category}>{getCatLabel(m.category)}</span>
                              {m.matched_rule && (
                                <span className="badge-tag" style={{ marginLeft: "6px" }} title={t.matched_rule_title}>
                                  {fmt(t.matched_rule_badge, { rule: m.matched_rule })}
                                </span>
                              )}
                            </td>
                            <td className="mono">{formatBytes(m.size)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            )}

            {phase === "done" && report && (
              <section className="glass report-card">
                <h2>{t.sort_done_title}</h2>
                <p className="muted">
                  <b>{fmtNum(report.moved)}</b> {t.sort_done_desc} ({formatBytes(report.bytes_moved)})
                </p>
                <div className="actions" style={{ marginTop: "16px" }}>
                  <button className="btn btn-primary" onClick={undoLast}>{t.btn_undo}</button>
                  <button className="btn btn-ghost" onClick={reset}>{t.btn_rescan}</button>
                </div>
              </section>
            )}

            {undoReport && (
              <div className="alert alert-success" style={{ marginTop: "16px" }}>
                <span className="alert-label">Done</span>
                <span>
                  <b>{fmtNum(undoReport.restored + (undoReport.restored_empty ?? 0))}</b> {t.undo_success}
                </span>
              </div>
            )}
          </>
        )}

        {/* TAB 2: Junk & Cache Cleaner */}
        {activeTab === "search" && (
          <Suspense fallback={<div className="glass" style={{ padding: "40px", textAlign: "center" }}><p className="muted">{t.gs_running}</p></div>}>
            <SearchPanel lang={lang} dropped={dropped} />
          </Suspense>
        )}

        {/* TAB 3: Junk Cleaner */}
        {activeTab === "junk" && (
          <section className="glass">
            <div className="dupes-header">
              <div>
                <h1>{t.junk_title}</h1>
                <p>{t.junk_desc}</p>
              </div>
              {junkLocs.length > 0 && (
                <div className="summary-actions">
                  <button className="btn btn-ghost" onClick={handleScanJunk} disabled={junkBusy}>
                    {junkBusy ? t.junk_btn_scanning : t.junk_btn_scan}
                  </button>
                  <button className="btn btn-primary" onClick={handleCleanJunk} disabled={junkBusy || selectedJunk.size === 0}>
                    {junkBusy ? t.junk_btn_cleaning : t.junk_btn_clean}
                  </button>
                </div>
              )}
            </div>

            {cleanReport && (
              <div className="alert alert-success" style={{ margin: "16px 0" }}>
                <span className="alert-label">Done</span>
                <span>
                  {t.junk_cleaned_summary}{" "}
                  {fmt(t.junk_purged_detail, {
                    files: fmtNum(cleanReport.files_deleted),
                    size: formatBytes(cleanReport.bytes_freed),
                  })}
                  {cleanReport.files_failed > 0 &&
                    " " + fmt(t.junk_in_use_skipped, { count: fmtNum(cleanReport.files_failed) })}
                </span>
              </div>
            )}

            {junkLocs.length > 0 ? (
              <>
                <div className="actions" style={{ margin: "16px 0" }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => setSelectedJunk(new Set(junkLocs.map((l) => l.id)))}>
                    {t.junk_select_all}
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setSelectedJunk(new Set())}>
                    {t.junk_deselect_all}
                  </button>
                </div>
                <div className="junk-grid">
                  {junkLocs.map((loc) => (
                    <label key={loc.id} className="junk-card">
                      <input
                        type="checkbox"
                        checked={selectedJunk.has(loc.id)}
                        onChange={() => toggleJunkSelection(loc.id)}
                      />
                      <div className="junk-card-info">
                        <strong>{loc.name}</strong>
                        <p>{loc.description}</p>
                        <div className="junk-card-meta">
                          <span>{fmt(t.junk_files_count, { count: fmtNum(loc.file_count) })}</span>
                          <b>{formatBytes(loc.total_bytes)}</b>
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              </>
            ) : (
              <EmptyState
                icon="broom"
                title={t.junk_empty_title}
                body={t.junk_empty_hint}
              >
                <button className="btn btn-primary" onClick={handleScanJunk} disabled={junkBusy}>
                  {junkBusy ? t.junk_btn_scanning : t.junk_btn_scan}
                </button>
              </EmptyState>
            )}

            <div className="extras-panel">
              <div className="extras-head">
                <div>
                  <h2>{t.extras_title}</h2>
                  <p>{t.extras_desc}</p>
                </div>
                <div className="summary-actions">
                  <button className="btn btn-ghost" onClick={handleScanExtras} disabled={extrasBusy}>
                    {extrasBusy ? t.extras_btn_scanning : extrasScan ? t.extras_btn_rescan : t.extras_btn_pick}
                  </button>
                  {extrasScan && extrasCount > 0 && (
                    <button className="btn btn-primary" onClick={handleCleanExtras} disabled={extrasBusy}>
                      {fmt(t.extras_clean, { count: fmtNum(extrasCount) })}
                    </button>
                  )}
                </div>
              </div>

              {extrasReport && (
                <div className="alert alert-success" style={{ marginTop: "12px" }}>
                  <span className="alert-label">Done</span>
                  <span>
                    {fmt(t.extras_done, {
                      dirs: fmtNum(extrasReport.dirs_removed),
                      files: fmtNum(extrasReport.files_removed),
                    })}
                    {extrasReport.failed > 0 &&
                      " " + fmt(t.extras_failed, { count: fmtNum(extrasReport.failed) })}
                  </span>
                </div>
              )}

              {extrasScan && (
                <>
                  <p className="panel-note" style={{ marginTop: "12px" }}>
                    {fmt(t.extras_scanned, { count: fmtNum(extrasScan.scanned_entries), root: extrasScan.root })}
                  </p>
                  {extrasCount === 0 ? (
                    <p className="panel-note">{t.extras_none}</p>
                  ) : (
                    <>
                      <div className="extras-kinds">
                        <label>
                          <input
                            type="checkbox"
                            checked={extrasPick.dirs}
                            onChange={(e) => setExtrasPick((p) => ({ ...p, dirs: e.target.checked }))}
                          />
                          {t.extras_dirs} <b>{fmtNum(extrasScan.empty_dirs.length)}</b>
                        </label>
                        <label>
                          <input
                            type="checkbox"
                            checked={extrasPick.files}
                            onChange={(e) => setExtrasPick((p) => ({ ...p, files: e.target.checked }))}
                          />
                          {t.extras_files} <b>{fmtNum(extrasScan.empty_files.length)}</b>
                        </label>
                      </div>
                      <div className="extras-list mono">
                        {[
                          ...(extrasPick.dirs ? extrasScan.empty_dirs : []),
                          ...(extrasPick.files ? extrasScan.empty_files : []),
                        ]
                          .slice(0, 200)
                          .map((p) => (
                            <div key={p} className="ellipsis" title={p}>
                              {p}
                            </div>
                          ))}
                      </div>
                      <p className="panel-note" style={{ marginTop: "8px" }}>
                        {t.extras_undo_hint}
                      </p>
                    </>
                  )}
                </>
              )}
            </div>
          </section>
        )}

        {/* TAB 3: Duplicates Finder */}
        {activeTab === "dupes" && (
          <section className="glass">
            <div className="dupes-header">
              <div>
                <h1>{t.dupes_title}</h1>
                <p>{t.dupes_desc}</p>
              </div>
              {dupes.length > 0 && (
                <div className="summary-actions">
                  <button className="btn btn-primary" onClick={runDupes} disabled={dupeBusy || phase === "scanning"}>
                    {dupeBusy ? t.dupes_btn_scanning : t.dupes_btn_scan}
                  </button>
                </div>
              )}
            </div>

            {quarantineReport && (
              <div className="alert alert-success" style={{ margin: "16px 0" }}>
                <span className="alert-label">Done</span>
                <span><b>{fmtNum(quarantineReport.moved)}</b> {t.dupes_quarantine_done}</span>
              </div>
            )}

            {dupes.length > 0 ? (
              <div style={{ marginTop: "20px" }}>
                <div className="dupes-toolbar">
                  <span>{t.dupes_reclaimable} <b>{formatBytes(dupes.reduce((acc, g) => acc + g.wasted, 0))}</b></span>
                  <SearchBox
                    value={search}
                    onChange={setSearch}
                    placeholder={t.search_placeholder}
                    clearLabel={t.search_clear}
                    inputRef={searchRef}
                  />
                  <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                    <select
                      className="btn btn-ghost"
                      value={dupeKeep}
                      onChange={(e) => setDupeKeep(e.target.value as "oldest" | "newest")}
                    >
                      <option value="oldest">{t.dupes_keep_oldest}</option>
                      <option value="newest">{t.dupes_keep_newest}</option>
                    </select>
                    <button className="btn btn-primary" onClick={quarantineDuplicates} disabled={dupeBusy}>
                      {t.dupes_btn_quarantine}
                    </button>
                  </div>
                </div>

                <div className="dupes-list">
                  {dupeGroups.map((g, i) => (
                    <div key={i} className="glass dupe-group">
                      <div className="dupe-group-header">
                        <span className="mono">
                          {fmt(t.dupes_per_file, {
                            size: formatBytes(g.size),
                            count: fmtNum(g.files.length),
                          })}
                        </span>
                        <span className="badge-tag">
                          {fmt(t.dupes_waste, { size: formatBytes(g.wasted) })}
                        </span>
                      </div>
                      <div className="dupe-files">
                        {g.files.map((f, fi) => (
                          <div key={fi} className="dupe-file-row mono ellipsis">
                            <span>
                              {fi === (dupeKeep === "oldest" ? 0 : g.files.length - 1)
                                ? t.dupes_keep_tag
                                : t.dupes_move_tag}{" "}
                              {f.path}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <EmptyState
                icon="search"
                title={folder ? t.dupes_empty : t.dupes_select_folder}
                body={folder ? t.dupes_desc : undefined}
              >
                {folder ? (
                  <button className="btn btn-primary" onClick={runDupes} disabled={dupeBusy || phase === "scanning"}>
                    {dupeBusy ? t.dupes_btn_scanning : t.dupes_btn_scan}
                  </button>
                ) : (
                  <button className="btn btn-primary" onClick={pickFolder}>
                    {t.hero_drop_btn}
                  </button>
                )}
              </EmptyState>
            )}
          </section>
        )}

        {/* TAB 4: Disk Space */}
        {activeTab === "disk" && (
          <section className="glass disk-bars">
            <div className="dupes-header">
              <div>
                <h1>{t.disk_title}</h1>
                <p>{t.disk_desc}</p>
              </div>
              {folder && (
                <div className="summary-actions">
                  <button className="btn btn-ghost" onClick={loadDiskStats} disabled={loadingDisk}>
                    {loadingDisk ? t.disk_loading : <><Icon name="refresh" size={13} /> {t.btn_rescan}</>}
                  </button>
                </div>
              )}
            </div>

            {/* Detected Drives Overview */}
            {drives.length > 0 && (
              <div style={{ margin: "4px 0 16px" }}>
                <h2>{t.disk_drives_title}</h2>
                <div className="fluent-drives-grid">
                  {drives.map((d) => {
                    const usagePct = pct(d.used_bytes, d.total_bytes);
                    return (
                      <div key={d.letter} className="fluent-drive-card">
                        <div className="fluent-drive-icon"><Icon name="chart" size={16} /></div>
                        <div className="fluent-drive-info">
                          <div className="fluent-drive-header">
                            <span className="fluent-drive-name">
                              {fmt(t.disk_drive_name, { letter: d.letter })}
                            </span>
                            <span className="mono fluent-drive-free">
                              {fmt(t.disk_free_short, { size: formatBytes(d.free_bytes) })}
                            </span>
                          </div>
                          <div className="meter fluent-drive-meter">
                            <div className="meter-fill" style={{ width: `${usagePct}%` }} />
                          </div>
                          <div className="fluent-drive-meta">
                            <span>
                              {fmt(t.disk_free_of, {
                                free: formatBytes(d.free_bytes),
                                total: formatBytes(d.total_bytes),
                              })}
                            </span>
                            <span className="mono">{usagePct}%</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {diskStats ? (
              <>
                <div className="summary">
                  <div className="stat"><b>{fmtNum(diskStats.total_files)}</b><span>{t.disk_total_files}</span></div>
                  <div className="stat"><b>{formatBytes(diskStats.total_bytes)}</b><span>{t.disk_total_size}</span></div>
                </div>

                <div className="disk-panel">
                  <h2>{t.disk_category_breakdown}</h2>
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "10px" }}>
                    {diskStats.category_breakdown.map(([cat, count, bytes]) => {
                      const share = pct(bytes, diskStats.total_bytes);
                      return (
                        <div key={cat} className="disk-bar-row">
                          <div className="disk-bar-header">
                            <span>{getCatLabel(cat)} ({fmtNum(count)} {t.settings_formats_count})</span>
                            <span className="mono">{formatBytes(bytes)} ({share}%)</span>
                          </div>
                          <div className="meter">
                            <div className="meter-fill" style={{ width: `${share}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="disk-panel">
                  <h2>{t.disk_largest_files}</h2>
                  <div className="list-toolbar" style={{ marginTop: "10px" }}>
                    <SearchBox
                      value={search}
                      onChange={setSearch}
                      placeholder={t.search_placeholder}
                      clearLabel={t.search_clear}
                      inputRef={searchRef}
                    />
                    <span className="muted" style={{ fontSize: "12px" }}>
                      {fmt(t.search_count, { shown: fmtNum(diskRows.length), total: fmtNum(diskStats.largest_files.length) })}
                    </span>
                  </div>
                  <div className="table-container" style={{ marginTop: "6px" }}>
                    <table>
                      <thead>
                        <tr>
                          <th>
                            <button type="button" className="th-sort" onClick={() => toggleDiskSort("name")}>
                              {t.disk_col_name}
                              {diskSortKey === "name" ? (diskSortDir === "asc" ? " ▲" : " ▼") : ""}
                            </button>
                          </th>
                          <th>
                            <button type="button" className="th-sort" onClick={() => toggleDiskSort("size")}>
                              {t.disk_col_size}
                              {diskSortKey === "size" ? (diskSortDir === "asc" ? " ▲" : " ▼") : ""}
                            </button>
                          </th>
                          <th>
                            <button type="button" className="th-sort" onClick={() => toggleDiskSort("path")}>
                              {t.disk_col_path}
                              {diskSortKey === "path" ? (diskSortDir === "asc" ? " ▲" : " ▼") : ""}
                            </button>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {diskRows.map(([filePath, size], i) => (
                          <tr key={i}>
                            <td className="mono ellipsis">{filePath.split(/[\\/]/).pop()}</td>
                            <td className="mono">{formatBytes(size)}</td>
                            <td className="mono ellipsis muted">{filePath}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            ) : (
              <EmptyState
                icon="chart"
                title={folder ? t.disk_loading : t.disk_empty_title}
                body={!folder ? t.disk_pick_first : undefined}
              >
                {!folder && (
                  <button className="btn btn-primary" onClick={pickFolder}>
                    {t.hero_drop_btn}
                  </button>
                )}
              </EmptyState>
            )}
          </section>
        )}

        {/* TAB 5: Watch Mode */}
        {activeTab === "watch" && (
          <section className="glass">
            <div className="dupes-header">
              <div>
                <h1>{t.watch_title}</h1>
                <p>{t.watch_desc}</p>
              </div>
              <button className="btn btn-primary" onClick={handleAddWatchFolder}>
                {t.watch_add_folder}
              </button>
            </div>

            <div className="watch-toggle-box">
              <label className="watch-switch">
                <input
                  type="checkbox"
                  checked={watchActive}
                  onChange={handleToggleWatch}
                />
                <span className="watch-slider" />
              </label>
              <div>
                <b>
                  {t.watch_toggle_active}:{" "}
                  {watchActive ? t.watch_state_active : t.watch_state_paused}
                </b>
                <p className="muted" style={{ margin: 0, fontSize: "12.5px" }}>
                  {t.watch_active_hint}
                </p>
              </div>
            </div>

            <div style={{ marginTop: "18px" }}>
              <h2>{fmt(t.watch_monitored_folders, { count: fmtNum(watchFolders.length) })}</h2>
              {watchFolders.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "8px" }}>
                  {watchFolders.map((wf) => (
                    <div key={wf} className="feed-row">
                      <span className="mono ellipsis"><Icon name="folder" size={12} /> {wf}</span>
                      <button className="btn btn-ghost btn-sm" onClick={() => handleRemoveWatchFolder(wf)}>{t.common_remove}</button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="panel-note" style={{ marginTop: "8px" }}>{t.watch_no_folders}</p>
              )}
            </div>

            <div style={{ marginTop: "20px" }}>
              <h2>{t.watch_live_log}</h2>
              <div className="feed-box">
                {watchEvents.length > 0 ? (
                  watchEvents.map((ev, i) => {
                    const failed = ev.action === "failed";
                    const skipped = ev.action === "skipped";
                    const label = failed
                      ? t.watch_event_failed
                      : skipped
                        ? t.watch_event_skipped
                        : t.watch_event_moved;
                    return (
                      <div key={i} className="feed-row">
                        <span>
                          {label}:{" "}
                          <b>{ev.filename}</b>
                          {ev.category ? <> → <i>{ev.category}</i></> : null}
                          {failed && ev.error ? (
                            <span className="muted"> — {ev.error}</span>
                          ) : null}
                        </span>
                        <span className="muted mono" style={{ fontSize: "11px" }}>
                          {new Date(ev.timestamp * 1000).toLocaleTimeString()}
                        </span>
                      </div>
                    );
                  })
                ) : (
                  <p className="panel-note">{t.watch_empty_log}</p>
                )}
              </div>
            </div>
          </section>
        )}

        {/* TAB 6: Scheduler */}
        {activeTab === "schedule" && (
          <section className="glass">
            <div className="dupes-header">
              <div>
                <h1>{t.sched_title}</h1>
                <p>{t.sched_desc}</p>
              </div>
              {tasks.length > 0 && (
                <button className="btn btn-primary" onClick={() => setShowAddTask(true)}>
                  {t.sched_add_task}
                </button>
              )}
            </div>

            {showAddTask && (
              <div className="new-task-panel">
                <b>{t.sched_new_task}</b>
                <div className="form-grid">
                  <input
                    type="text"
                    placeholder={t.sched_task_name_ph}
                    value={newTaskName}
                    onChange={(e) => setNewTaskName(e.target.value)}
                  />
                  <select
                    className="select-input"
                    value={newTaskKind}
                    onChange={(e) => setNewTaskKind(e.target.value as "junk" | "sort")}
                  >
                    <option value="junk">{t.sched_kind_junk}</option>
                    <option value="sort">{t.sched_kind_sort}</option>
                  </select>
                </div>
                {newTaskKind === "sort" && (
                  <div className="form-row">
                    <input
                      type="text"
                      placeholder={t.sched_folder_ph}
                      value={newTaskFolder}
                      onChange={(e) => setNewTaskFolder(e.target.value)}
                      style={{ flex: 1 }}
                    />
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={async () => {
                        const p = await invoke<string | null>("pick_folder");
                        if (p) setNewTaskFolder(p);
                      }}
                    >
                      {t.common_browse}
                    </button>
                  </div>
                )}
                <div className="form-row">
                  <span className="muted" style={{ fontSize: "12.5px" }}>{t.sched_interval_label}</span>
                  <input
                    type="number"
                    min="1"
                    value={newTaskInterval}
                    onChange={(e) => setNewTaskInterval(Number(e.target.value))}
                    style={{ width: "100px" }}
                  />
                  <div style={{ marginInlineStart: "auto", display: "flex", gap: "8px" }}>
                    <button className="btn btn-ghost" onClick={() => setShowAddTask(false)}>{t.common_cancel}</button>
                    <button className="btn btn-primary" onClick={handleSaveTask}>{t.sched_save}</button>
                  </div>
                </div>
              </div>
            )}

            <div className="sched-table-box">
              {tasks.length > 0 ? (
                <div className="table-container">
                  <table>
                    <thead>
                      <tr>
                        <th>{t.sched_col_task}</th>
                        <th>{t.sched_col_type}</th>
                        <th>{t.sched_col_interval}</th>
                        <th>{t.sched_col_last_run}</th>
                        <th>{t.sched_col_actions}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tasks.map((tk) => (
                        <tr key={tk.id}>
                          <td><b>{tk.name}</b> {tk.folder && <small className="muted mono">({tk.folder})</small>}</td>
                          <td><span className="badge-tag">{tk.kind.toUpperCase()}</span></td>
                          <td>{fmt(t.sched_minutes, { count: fmtNum(tk.interval_minutes) })}</td>
                          <td className="muted mono">
                            {tk.last_run ? new Date(tk.last_run * 1000).toLocaleString() : t.sched_never}
                          </td>
                          <td>
                            <div style={{ display: "flex", gap: "6px" }}>
                              <button className="btn btn-ghost btn-sm" onClick={() => handleRunTaskNow(tk.id)}>
                                {t.sched_run_now}
                              </button>
                              <button className="btn btn-ghost btn-sm" onClick={() => handleDeleteTask(tk.id)} aria-label={t.common_remove}>
                                ×
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState
                  icon="clock"
                  title={t.sched_empty_title}
                  body={t.sched_no_tasks}
                >
                  <button className="btn btn-primary" onClick={() => setShowAddTask(true)}>
                    {t.sched_add_task}
                  </button>
                </EmptyState>
              )}
            </div>

            {taskHistory.length > 0 && (
              <div style={{ marginTop: "22px" }}>
                <h2>{t.sched_recent_runs}</h2>
                <div className="feed-box">
                  {taskHistory.map((h, i) => (
                    <div key={i} className="feed-row">
                      <span><b>{h.task_name}</b>: {h.summary}</span>
                      <span className="muted mono" style={{ fontSize: "11px" }}>
                        {new Date(h.timestamp * 1000).toLocaleTimeString()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        {/* TAB 7: Operation History */}
        {activeTab === "history" && (
          <section className="glass">
            <div className="dupes-header">
              <div>
                <h1>{t.hist_title}</h1>
                <p>{t.hist_desc}</p>
              </div>
              <div className="summary-actions">
                <SearchBox
                  value={search}
                  onChange={setSearch}
                  placeholder={t.search_placeholder}
                  clearLabel={t.search_clear}
                  inputRef={searchRef}
                />
                <button className="btn btn-ghost" onClick={loadHistory}>
                  {t.btn_rescan}
                </button>
              </div>
            </div>

            {history.length > 0 ? (
              <div className="table-container" style={{ marginTop: "18px" }}>
                <table>
                  <thead>
                    <tr>
                      <th>{t.hist_col_when}</th>
                      <th>{t.hist_col_kind}</th>
                      <th>{t.hist_col_files}</th>
                      <th>{t.hist_col_size}</th>
                      <th>{t.hist_col_action}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyRows.map((h) => (
                      <tr key={h.op_id}>
                        <td className="mono">{new Date(h.timestamp_ms).toLocaleString()}</td>
                        <td>
                          <span className="badge-tag">{histKind(h.kind)}</span>
                        </td>
                        <td>
                          {fmtNum(h.files)}
                          {h.empty_entries > 0 && (
                            <span className="muted">
                              {" · "}
                              {fmt(t.hist_empty_entries, { count: fmtNum(h.empty_entries) })}
                            </span>
                          )}
                        </td>
                        <td className="mono">{formatBytes(h.bytes)}</td>
                        <td>
                          {history.length > 0 && h.op_id === history[0].op_id ? (
                            <button className="btn btn-ghost btn-sm" onClick={undoLast}>
                              {t.hist_undo}
                            </button>
                          ) : (
                            <span className="muted">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="panel-note" style={{ marginTop: "10px" }}>
                  {t.hist_undo_hint}
                </p>
              </div>
            ) : (
              <EmptyState icon="history" title={t.hist_empty_title} body={t.hist_empty_body} />
            )}
          </section>
        )}

        {activeTab === "compare" && (
          <Suspense fallback={<div className="glass" style={{ padding: "40px", textAlign: "center" }}><p className="muted">{t.cmp_running}</p></div>}>
            <ComparePanel lang={lang} dropped={dropped} />
          </Suspense>
        )}

        {activeTab === "archive" && (
          <Suspense fallback={<div className="glass" style={{ padding: "40px", textAlign: "center" }}><p className="muted">{t.arc_creating}</p></div>}>
            <ArchivePanel lang={lang} dropped={dropped} />
          </Suspense>
        )}

        {/* TAB 8: Smart Batch Renamer */}
        {activeTab === "renamer" && (
          <Suspense fallback={<div className="glass" style={{ padding: "40px", textAlign: "center" }}><p className="muted">{t.loader_renamer}</p></div>}>
            <BatchRenamer lang={lang} dropped={dropped} />
          </Suspense>
        )}

        {/* TAB 8: Image Studio */}
        {activeTab === "images" && (
          <Suspense fallback={<div className="glass" style={{ padding: "40px", textAlign: "center" }}><p className="muted">{t.loader_images}</p></div>}>
            <ImageStudio lang={lang} dropped={dropped} />
          </Suspense>
        )}

        {/* TAB 9: PDF Studio */}
        {activeTab === "pdf" && (
          <Suspense fallback={<div className="glass" style={{ padding: "40px", textAlign: "center" }}><p className="muted">{t.loader_pdf}</p></div>}>
            <PdfStudio lang={lang} dropped={dropped} />
          </Suspense>
        )}

        {/* TAB 10: Settings */}
        {activeTab === "settings" && (
          <>
          <header className="page-header">
            <div className="page-heading">
              <h1>{t.tab_settings}</h1>
              <p className="page-sub">{t.settings_page_desc}</p>
            </div>
          </header>
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            {settingsNotice && (
              <div className="alert alert-success">
                <span className="alert-label">Saved</span>
                <span>{settingsNotice}</span>
              </div>
            )}

            {/* Smart Keyword Rules Manager */}
            <section className="glass settings-section">
              <div className="settings-section-header">
                <div>
                  <h2>{t.rules_title}</h2>
                  <p>{t.rules_desc}</p>
                </div>
              </div>

              {smartRules.length > 0 ? (
                <div className="table-container" style={{ marginBottom: "16px" }}>
                  <table>
                    <thead>
                      <tr>
                        <th>{t.rules_col_name}</th>
                        <th>{t.rules_col_category}</th>
                        <th>{t.rules_col_keywords}</th>
                        <th>{t.rules_col_action}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {smartRules.map((r) => (
                        <tr key={r.id}>
                          <td><b>{r.name}</b></td>
                          <td><span className="cat-cell" data-cat={r.category}>{getCatLabel(r.category)}</span></td>
                          <td>
                            <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
                              {r.keywords.map((kw, i) => (
                                <span key={i} className="tag mono">{kw}</span>
                              ))}
                            </div>
                          </td>
                          <td>
                            <button className="btn btn-ghost btn-sm" onClick={() => handleDeleteSmartRule(r.id)}>×</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="panel-note" style={{ marginBottom: "14px" }}>{t.rules_no_rules}</p>
              )}

              {/* Add Rule Form */}
              <div className="form-row">
                <input
                  type="text"
                  placeholder={t.rules_name_ph}
                  value={newRuleName}
                  onChange={(e) => setNewRuleName(e.target.value)}
                  style={{ flex: 1, minWidth: "160px" }}
                />
                <select
                  className="select-input"
                  value={newRuleCategory}
                  onChange={(e) => setNewRuleCategory(e.target.value)}
                >
                  {(Object.keys(categories).length ? Object.keys(categories) : CATEGORY_ORDER).map((c) => (
                    <option key={c} value={c}>{getCatLabel(c)}</option>
                  ))}
                </select>
                <input
                  type="text"
                  placeholder={t.rules_keywords_ph}
                  value={newRuleKeywords}
                  onChange={(e) => setNewRuleKeywords(e.target.value)}
                  style={{ flex: 1.5, minWidth: "200px" }}
                />
                <button className="btn btn-primary" onClick={handleAddSmartRule}>
                  {t.rules_add_btn}
                </button>
              </div>
            </section>

            {/* Categories and File Formats */}
            <section className="glass settings-section">
              <div className="settings-section-header">
                <div>
                  <h2>{t.settings_cat_title}</h2>
                  <p>{t.settings_cat_desc}</p>
                </div>
                <div className="summary-actions">
                  <button className="btn btn-primary" onClick={saveSettings}>{t.settings_btn_save}</button>
                  <button className="btn btn-ghost" onClick={resetSettings}>{t.settings_btn_reset}</button>
                </div>
              </div>

              <div className="settings-grid">
                {Object.entries(categories).map(([cat, exts]) => (
                  <div key={cat} className="cat-box">
                    <div className="cat-box-header">
                      <span>{getCatLabel(cat)}</span>
                      <span className="muted mono" style={{ fontSize: "12px" }}>
                        {fmtNum(exts.length)} {t.settings_formats_count}
                      </span>
                    </div>
                    <div className="tags">
                      {exts.map((e) => (
                        <span key={e} className="tag mono">
                          {e}
                          <button onClick={() => removeExtension(cat, e)} title={t.ext_remove}>×</button>
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
                      />
                      <button className="btn btn-ghost btn-sm" onClick={() => addExtension(cat)}>
                        {t.settings_add_btn}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
          </>
        )}
        </div>
      </main>
    </div>
  );
}
