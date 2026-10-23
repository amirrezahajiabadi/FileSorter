import { lazy, Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import {
  CATEGORY_ICONS,
  type CategoryMap,
  type CleanReport,
  type DiskStats,
  type DriveInfo,
  type DuplicateGroup,
  type ExecReport,
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
import { STRINGS, CATEGORY_LABELS } from "./i18n";
import OnboardingModal from "./OnboardingModal";
import UpdateModal from "./UpdateModal";

const BatchRenamer = lazy(() => import("./BatchRenamer"));
const ImageStudio = lazy(() => import("./ImageStudio"));
const PdfStudio = lazy(() => import("./PdfStudio"));

export type Theme = "fluent" | "dark" | "light" | "aurora" | "sunset";

export interface ThemeMeta {
  id: Theme;
  name: string;
  icon: string;
  desc: string;
  swatch: string[];
}

export const THEMES: ThemeMeta[] = [
  {
    id: "fluent",
    name: "Liquid Smoke",
    icon: "◐",
    desc: "Smoked crystal glass with a soft prismatic edge and deep ambient depth",
    swatch: ["#0b0b0d", "#2b2b31", "#d8d8df"],
  },
  {
    id: "dark",
    name: "Obsidian",
    icon: "●",
    desc: "Near-black glass with restrained highlights and crisp white type",
    swatch: ["#070709", "#18181b", "#f4f4f5"],
  },
  {
    id: "light",
    name: "Crystal Frost",
    icon: "☀️",
    desc: "Bright frosted glass with paper-white surfaces and quiet contrast",
    swatch: ["#f4f4f5", "#ffffff", "#18181b"],
  },
  {
    id: "aurora",
    name: "Liquid Prism",
    icon: "◇",
    desc: "Iridescent glass with subtle cool and warm refraction at the edges",
    swatch: ["#0a0b10", "#8ea8c9", "#d8b8c8"],
  },
  {
    id: "sunset",
    name: "Rose Quartz",
    icon: "◈",
    desc: "Warm pearl glass with a faint rose and amber shimmer",
    swatch: ["#120d0f", "#d8b8b8", "#c8a890"],
  },
];

type IconName =
  | "drop" | "folder" | "broom" | "search" | "chart" | "eye" | "clock"
  | "pen" | "image" | "pdf" | "settings" | "spark" | "home" | "refresh"
  | "palette" | "chevronLeft" | "chevronRight" | "info" | "bolt";

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
    chevronLeft: <path d="m14.5 5.5-6.5 6.5 6.5 6.5" />,
    chevronRight: <path d="m9.5 5.5 6.5 6.5-6.5 6.5" />,
    info: <><circle cx="12" cy="12" r="8.5" /><path d="M12 10.5v5" /><path d="M12 7.7h.01" /></>,
    bolt: <path d="m13.2 2.8-7 10.4h5.2l-.6 8 7-10.4h-5.2l.6-8Z" />,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {paths[name]}
    </svg>
  );
}

type Phase = "idle" | "scanning" | "ready" | "sorting" | "done";
type ActiveTab = "sort" | "junk" | "dupes" | "disk" | "watch" | "schedule" | "renamer" | "images" | "pdf" | "settings";

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
  }, [t.update_latest]);

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
        }
      }));
      keep(await listen<{ report?: ExecReport; error?: string }>("quarantine-done", (ev) => {
        setDupeBusy(false);
        if (ev.payload.error) {
          setError(ev.payload.error);
        } else if (ev.payload.report) {
          setQuarantineReport(ev.payload.report);
          setDupes([]);
        }
      }));
      keep(await listen<{ report?: UndoReport; error?: string }>("undo-done", (ev) => {
        if (ev.payload.error) {
          setError(ev.payload.error);
        } else if (ev.payload.report) {
          setUndoReport(ev.payload.report);
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
      alert(`Task executed: ${res}`);
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
      setSettingsNotice("Smart rule added successfully");
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
      setSettingsNotice("Smart rule deleted");
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
      />

      {/* Auto-Update Modal */}
      <UpdateModal
        isOpen={updateModalOpen}
        onClose={() => setUpdateModalOpen(false)}
        updateData={updateData}
      />

      {/* Left Collapsible Glass Sidebar */}
      <aside className="sidebar-glass" aria-label="Main Navigation">
        <div className="sidebar-header">
          <div className="sidebar-brand">
            <span className="sidebar-brand-icon"><Icon name="drop" size={19} /></span>
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
            title={sidebarExpanded ? "Collapse Sidebar" : "Expand Sidebar"}
            aria-label={sidebarExpanded ? "Collapse Sidebar" : "Expand Sidebar"}
          >
            {sidebarExpanded ? "◀" : "▶"}
          </button>
        </div>

        {/* Center: Vertical Navigation Tabs */}
        <nav className="sidebar-nav">
          <button
            type="button"
            className={`sidebar-tab ${activeTab === "sort" ? "active" : ""}`}
            onClick={() => setActiveTab("sort")}
            title={t.tab_sort}
          >
            <span className="sidebar-tab-icon"><Icon name="folder" /></span>
            {sidebarExpanded && <span className="sidebar-tab-label">{t.tab_sort}</span>}
          </button>
          <button
            type="button"
            className={`sidebar-tab ${activeTab === "junk" ? "active" : ""}`}
            onClick={() => setActiveTab("junk")}
            title={t.tab_junk}
          >
            <span className="sidebar-tab-icon"><Icon name="broom" /></span>
            {sidebarExpanded && <span className="sidebar-tab-label">{t.tab_junk}</span>}
          </button>
          <button
            type="button"
            className={`sidebar-tab ${activeTab === "dupes" ? "active" : ""}`}
            onClick={() => setActiveTab("dupes")}
            title={t.tab_dupes}
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
          >
            <span className="sidebar-tab-icon"><Icon name="chart" /></span>
            {sidebarExpanded && <span className="sidebar-tab-label">{t.tab_disk}</span>}
          </button>
          <button
            type="button"
            className={`sidebar-tab ${activeTab === "watch" ? "active" : ""}`}
            onClick={() => setActiveTab("watch")}
            title={t.tab_watch}
          >
            <span className="sidebar-tab-icon"><Icon name="eye" /></span>
            {sidebarExpanded && <span className="sidebar-tab-label">{t.tab_watch}</span>}
            {watchActive && <span className="sidebar-tab-badge">ON</span>}
          </button>
          <button
            type="button"
            className={`sidebar-tab ${activeTab === "schedule" ? "active" : ""}`}
            onClick={() => setActiveTab("schedule")}
            title={t.tab_schedule}
          >
            <span className="sidebar-tab-icon"><Icon name="clock" /></span>
            {sidebarExpanded && <span className="sidebar-tab-label">{t.tab_schedule}</span>}
            {tasks.length > 0 && <span className="sidebar-tab-badge">{tasks.length}</span>}
          </button>
          <button
            type="button"
            className={`sidebar-tab ${activeTab === "renamer" ? "active" : ""}`}
            onClick={() => setActiveTab("renamer")}
            title={t.tab_renamer}
          >
            <span className="sidebar-tab-icon"><Icon name="pen" /></span>
            {sidebarExpanded && <span className="sidebar-tab-label">{t.tab_renamer}</span>}
          </button>
          <button
            type="button"
            className={`sidebar-tab ${activeTab === "images" ? "active" : ""}`}
            onClick={() => setActiveTab("images")}
            title={t.tab_images}
          >
            <span className="sidebar-tab-icon"><Icon name="image" /></span>
            {sidebarExpanded && <span className="sidebar-tab-label">{t.tab_images}</span>}
          </button>
          <button
            type="button"
            className={`sidebar-tab ${activeTab === "pdf" ? "active" : ""}`}
            onClick={() => setActiveTab("pdf")}
            title={t.tab_pdf}
          >
            <span className="sidebar-tab-icon"><Icon name="pdf" /></span>
            {sidebarExpanded && <span className="sidebar-tab-label">{t.tab_pdf}</span>}
          </button>
          <button
            type="button"
            className={`sidebar-tab ${activeTab === "settings" ? "active" : ""}`}
            onClick={() => setActiveTab("settings")}
            title={t.tab_settings}
          >
            <span className="sidebar-tab-icon"><Icon name="settings" /></span>
            {sidebarExpanded && <span className="sidebar-tab-label">{t.tab_settings}</span>}
          </button>
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
                  {THEMES.find((x) => x.id === theme)?.name}
                </span>
              </div>
              <div className="theme-grid-selector">
                {THEMES.map((th) => (
                  <button
                    key={th.id}
                    type="button"
                    className={`theme-selector-btn ${theme === th.id ? "active" : ""}`}
                    onClick={() => setTheme(th.id)}
                    title={th.desc}
                    aria-label={`Switch to ${th.name}`}
                  >
                    <span className="theme-selector-icon">{th.icon}</span>
                    <span className="theme-selector-label">{th.name.split(" ")[0]}</span>
                  </button>
                ))}
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
              title={`Theme: ${THEMES.find((x) => x.id === theme)?.name}`}
              aria-label="Cycle theme"
            >
              <span className="sidebar-tab-icon"><Icon name="palette" /></span>
            </button>
          )}
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="main-content-flow">
        {/* Top Header Bar - Fluent Windows 11 Explorer style */}
        <div className="top-banner-bar">
          <div className="banner-left">
            <div className="fluent-address-bar">
              <div className="fluent-nav-arrows">
                <button
                  type="button"
                  className="fluent-arrow-btn"
                  onClick={() => setActiveTab("sort")}
                  title={t.tab_sort}
                  aria-label="Home"
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
                   activeTab === "junk" ? t.tab_junk :
                   activeTab === "dupes" ? t.tab_dupes :
                   activeTab === "disk" ? t.tab_disk :
                   activeTab === "watch" ? t.tab_watch :
                   activeTab === "schedule" ? t.tab_schedule :
                   activeTab === "renamer" ? t.tab_renamer :
                   activeTab === "images" ? t.tab_images :
                   activeTab === "pdf" ? t.tab_pdf : t.tab_settings}
                </span>
                {folder && (
                  <>
                    <span className="fluent-crumb-sep">›</span>
                    <span className="fluent-crumb-folder" title={folder}>{folder.split(/[\\/]/).pop()}</span>
                  </>
                )}
              </div>
            </div>
            <span className="badge-tag fluent-badge">Tauri 2 + Rust</span>
          </div>
          <div className="banner-right">
            <button
              type="button"
              className="btn btn-ghost fluent-banner-btn"
              style={{ fontSize: "12px", padding: "5px 12px" }}
              onClick={() => setOnboardingOpen(true)}
            >
              <Icon name="info" size={14} /> {t.onboarding_btn_tour}
            </button>
            <button
              type="button"
              className="btn btn-ghost fluent-banner-btn"
              style={{ fontSize: "12px", padding: "5px 12px" }}
              onClick={() => checkForUpdates(true)}
              disabled={checkingUpdate}
            >
              <Icon name="spark" size={14} />{" "}
              {checkingUpdate ? t.update_checking : updateData?.has_update ? t.update_available : t.update_check_btn}
            </button>
          </div>
        </div>

        <div className="content-body">
          {error && (
            <div className="glass alert alert-error">
              <span>⚠ {error}</span>
              <button className="btn btn-ghost btn-sm" onClick={() => setError("")}>✕</button>
            </div>
          )}

          {/* TAB 1: Organize / File Sorter */}
          {activeTab === "sort" && (
          <>
            <header className="hero glass">
              <div className="hero-text">
                <h2>{t.hero_title}</h2>
                <p className="muted">{t.hero_subtitle}</p>
              </div>

              {folder ? (
                <div className="folder-chip">
                  <span className="folder-icon"><Icon name="folder" size={16} /></span>
                  <span className="mono folder-path" title={folder}>{folder}</span>
                  <button className="btn btn-ghost" onClick={pickFolder}>Change</button>
                </div>
              ) : (
                <div className="dropzone-liquid" onClick={pickFolder}>
                  <div className="dropzone-icon"><Icon name="drop" size={30} /></div>
                  <button className="btn btn-primary btn-large">{t.hero_drop_btn}</button>
                  <p className="muted dropzone-hint">Click anywhere inside this liquid card to select folder</p>
                </div>
              )}

              {phase === "scanning" && scan && (
                <div className="scan-status animate-fade-in">
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
            </header>

            {plan && phase !== "done" && (
              <section className="glass plan-review animate-fade-in">
                <div className="summary">
                  <div className="stat"><b>{fmtNum(plan.total_moves ?? plan.moves.length)}</b><span>{t.summary_files}</span></div>
                  <div className="stat"><b>{formatBytes(plan.total_size)}</b><span>{t.summary_size}</span></div>
                  <div className="stat"><b>{plan.counts.length}</b><span>{t.summary_categories}</span></div>
                </div>

                <div className="category-chips">
                  {plan.counts.map(([cat, count]) => (
                    <span key={cat} className="cat-chip">
                      <span className="cat-icon">{CATEGORY_ICONS[cat] ?? "•"}</span>
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
                    {plan.total_moves && plan.total_moves > plan.moves.length && (
                      <p className="muted" style={{ fontSize: "12px", margin: "0 0 10px 4px" }}>
                        ⚡ Showing preview of first {plan.moves.length} of {fmtNum(plan.total_moves)} planned moves. All files will be processed on sort.
                      </p>
                    )}
                    <table>
                      <thead>
                        <tr>
                          <th>Source File</th>
                          <th>Destination</th>
                          <th>Category</th>
                          <th>Size</th>
                        </tr>
                      </thead>
                      <tbody>
                        {plan.moves.slice(0, 100).map((m, i) => (
                          <tr key={i}>
                            <td className="mono ellipsis">{m.source.split(/[\\/]/).pop()}</td>
                            <td className="mono ellipsis">{m.destination.replace(plan.root, "")}</td>
                            <td>
                              <span className="cat-cell">{m.category}</span>
                              {m.matched_rule && (
                                <span className="badge-tag" style={{ marginLeft: "6px" }} title="Matched via Smart Rule">
                                  Target: {m.matched_rule}
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
              <section className="glass report-card animate-fade-in">
                <h3>{t.sort_done_title}</h3>
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
              <div className="glass alert alert-success" style={{ marginTop: "16px" }}>
                <span>✓ <b>{fmtNum(undoReport.restored)}</b> {t.undo_success}</span>
              </div>
            )}
          </>
        )}

        {/* TAB 2: Junk & Cache Cleaner */}
        {activeTab === "junk" && (
          <section className="glass">
            <div className="dupes-header">
              <div>
                <h3>{t.junk_title}</h3>
                <p className="muted" style={{ margin: "4px 0 0" }}>{t.junk_desc}</p>
              </div>
              <div className="summary-actions">
                <button className="btn btn-ghost" onClick={handleScanJunk} disabled={junkBusy}>
                  {junkBusy ? t.junk_btn_scanning : t.junk_btn_scan}
                </button>
                {junkLocs.length > 0 && (
                  <button className="btn btn-primary" onClick={handleCleanJunk} disabled={junkBusy || selectedJunk.size === 0}>
                    {junkBusy ? t.junk_btn_cleaning : t.junk_btn_clean}
                  </button>
                )}
              </div>
            </div>

            {cleanReport && (
              <div className="glass alert alert-success" style={{ margin: "16px 0" }}>
                <span>
                  ✓ {t.junk_cleaned_summary} Purged <b>{fmtNum(cleanReport.files_deleted)}</b> files (<b>{formatBytes(cleanReport.bytes_freed)}</b> freed).
                  {cleanReport.files_failed > 0 && ` (${cleanReport.files_failed} in-use files safely skipped)`}
                </span>
              </div>
            )}

            {junkLocs.length > 0 ? (
              <>
                <div style={{ display: "flex", gap: "10px", margin: "16px 0" }}>
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
                          <span>{fmtNum(loc.file_count)} files</span>
                          <b>{formatBytes(loc.total_bytes)}</b>
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              </>
            ) : (
              <p className="muted" style={{ padding: "36px 0", textAlign: "center" }}>
                Click &quot;Scan Junk Locations&quot; above to discover temporary files and caches.
              </p>
            )}
          </section>
        )}

        {/* TAB 3: Duplicates Finder */}
        {activeTab === "dupes" && (
          <section className="glass">
            <div className="dupes-header">
              <div>
                <h3>{t.dupes_title}</h3>
                <p className="muted" style={{ margin: "4px 0 0" }}>{t.dupes_desc}</p>
              </div>
              {folder && (
                <button className="btn btn-primary" onClick={runDupes} disabled={dupeBusy || phase === "scanning"}>
                  {dupeBusy ? t.dupes_btn_scanning : t.dupes_btn_scan}
                </button>
              )}
            </div>

            {quarantineReport && (
              <div className="glass alert alert-success" style={{ margin: "16px 0" }}>
                <span>✓ <b>{fmtNum(quarantineReport.moved)}</b> {t.dupes_quarantine_done}</span>
              </div>
            )}

            {dupes.length > 0 ? (
              <div style={{ marginTop: "20px" }}>
                <div className="dupes-toolbar">
                  <span>{t.dupes_reclaimable} <b>{formatBytes(dupes.reduce((acc, g) => acc + g.wasted, 0))}</b></span>
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
                  {dupes.slice(0, 50).map((g, i) => (
                    <div key={i} className="glass dupe-group">
                      <div className="dupe-group-header">
                        <span className="mono">{formatBytes(g.size)} per file ({g.files.length} copies)</span>
                        <span className="badge-tag">Waste: {formatBytes(g.wasted)}</span>
                      </div>
                      <div className="dupe-files">
                        {g.files.map((f, fi) => (
                          <div key={fi} className="dupe-file-row mono ellipsis">
                            <span>
                              {fi === (dupeKeep === "oldest" ? 0 : g.files.length - 1)
                                ? "★ [Keep]"
                                : "✕ [Move]"}{" "}
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
              <p className="muted" style={{ padding: "36px 0", textAlign: "center" }}>
                {folder ? t.dupes_empty : "Select a folder first to analyze duplicates."}
              </p>
            )}
          </section>
        )}

        {/* TAB 4: Disk Space */}
        {activeTab === "disk" && (
          <section className="glass disk-bars">
            <div className="dupes-header">
              <div>
                <h3>{t.disk_title}</h3>
                <p className="muted" style={{ margin: "4px 0 0" }}>{t.disk_desc}</p>
              </div>
              {folder && (
                <button className="btn btn-ghost" onClick={loadDiskStats} disabled={loadingDisk}>
                  {loadingDisk ? t.disk_loading : <><Icon name="refresh" size={13} /> {t.btn_rescan}</>}
                </button>
              )}
            </div>

            {/* Detected Drives Overview */}
            {drives.length > 0 && (
              <div style={{ margin: "16px 0" }}>
                <b>{t.disk_drives_title}</b>
                <div className="fluent-drives-grid">
                  {drives.map((d) => {
                    const usagePct = pct(d.used_bytes, d.total_bytes);
                    return (
                      <div key={d.letter} className="glass fluent-drive-card">
                        <div className="fluent-drive-icon"><Icon name="chart" size={18} /></div>
                        <div className="fluent-drive-info">
                          <div className="fluent-drive-header">
                            <span className="fluent-drive-name">Local Disk ({d.letter}:)</span>
                            <span className="mono fluent-drive-free">{formatBytes(d.free_bytes)} free</span>
                          </div>
                          <div className="meter fluent-drive-meter">
                            <div className="meter-fill" style={{ width: `${usagePct}%` }} />
                          </div>
                          <div className="fluent-drive-meta">
                            <span>{formatBytes(d.free_bytes)} free of {formatBytes(d.total_bytes)}</span>
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
                <div className="summary" style={{ padding: "14px 0", borderBottom: "1px solid var(--line)" }}>
                  <div className="stat"><b>{fmtNum(diskStats.total_files)}</b><span>{t.disk_total_files}</span></div>
                  <div className="stat"><b>{formatBytes(diskStats.total_bytes)}</b><span>{t.disk_total_size}</span></div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "12px", margin: "16px 0" }}>
                  <b>{t.disk_category_breakdown}</b>
                  {diskStats.category_breakdown.map(([cat, count, bytes]) => {
                    const share = pct(bytes, diskStats.total_bytes);
                    return (
                      <div key={cat} className="disk-bar-row">
                        <div className="disk-bar-header">
                          <span>{CATEGORY_ICONS[cat] ?? "•"} {getCatLabel(cat)} ({fmtNum(count)} {t.settings_formats_count})</span>
                          <span className="mono">{formatBytes(bytes)} ({share}%)</span>
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
              <p className="muted" style={{ padding: "36px 0", textAlign: "center" }}>
                {folder ? t.disk_loading : t.disk_pick_first}
              </p>
            )}
          </section>
        )}

        {/* TAB 5: Watch Mode */}
        {activeTab === "watch" && (
          <section className="glass">
            <div className="dupes-header">
              <div>
                <h3>{t.watch_title}</h3>
                <p className="muted" style={{ margin: "4px 0 0" }}>{t.watch_desc}</p>
              </div>
              <button className="btn btn-primary" onClick={handleAddWatchFolder}>
                {t.watch_add_folder}
              </button>
            </div>

            <div className="watch-toggle-box" style={{ marginTop: "16px" }}>
              <label className="watch-switch">
                <input
                  type="checkbox"
                  checked={watchActive}
                  onChange={handleToggleWatch}
                />
                <span className="watch-slider" />
              </label>
              <div>
                <b>{t.watch_toggle_active}: {watchActive ? "ACTIVE" : "PAUSED"}</b>
                <p className="muted" style={{ margin: 0, fontSize: "12px" }}>
                  When active, newly appearing files in watched directories are automatically organized into categories.
                </p>
              </div>
            </div>

            <div style={{ marginTop: "16px" }}>
              <b>Monitored Folders ({watchFolders.length}):</b>
              {watchFolders.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "8px" }}>
                  {watchFolders.map((wf) => (
                    <div key={wf} className="feed-row">
                      <span className="mono ellipsis"><Icon name="folder" size={12} /> {wf}</span>
                      <button className="btn btn-ghost btn-sm" onClick={() => handleRemoveWatchFolder(wf)}>Remove</button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="muted" style={{ padding: "16px 0" }}>{t.watch_no_folders}</p>
              )}
            </div>

            <div style={{ marginTop: "24px" }}>
              <b>{t.watch_live_log}</b>
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
                          {failed ? "✕" : skipped ? "↷" : "✓"} {label}:{" "}
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
                  <p className="muted" style={{ padding: "24px 0", textAlign: "center" }}>{t.watch_empty_log}</p>
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
                <h3>{t.sched_title}</h3>
                <p className="muted" style={{ margin: "4px 0 0" }}>{t.sched_desc}</p>
              </div>
              <button className="btn btn-primary" onClick={() => setShowAddTask(true)}>
                {t.sched_add_task}
              </button>
            </div>

            {showAddTask && (
              <div className="glass" style={{ padding: "16px", margin: "16px 0", border: "1px solid var(--line-strong)" }}>
                <b>New Scheduled Task</b>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginTop: "10px" }}>
                  <input
                    type="text"
                    placeholder="Task Name (e.g. Daily Cleanup)"
                    value={newTaskName}
                    onChange={(e) => setNewTaskName(e.target.value)}
                  />
                  <select
                    className="btn btn-ghost"
                    value={newTaskKind}
                    onChange={(e) => setNewTaskKind(e.target.value as "junk" | "sort")}
                  >
                    <option value="junk">Junk &amp; Temp Cleanup</option>
                    <option value="sort">Auto-Sort Folder</option>
                  </select>
                </div>
                {newTaskKind === "sort" && (
                  <div style={{ display: "flex", gap: "8px", marginTop: "10px" }}>
                    <input
                      type="text"
                      placeholder="Folder Path"
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
                      Browse
                    </button>
                  </div>
                )}
                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "10px" }}>
                  <span>Interval (minutes):</span>
                  <input
                    type="number"
                    min="1"
                    value={newTaskInterval}
                    onChange={(e) => setNewTaskInterval(Number(e.target.value))}
                    style={{ width: "100px" }}
                  />
                  <div style={{ marginLeft: "auto", display: "flex", gap: "8px" }}>
                    <button className="btn btn-ghost" onClick={() => setShowAddTask(false)}>Cancel</button>
                    <button className="btn btn-primary" onClick={handleSaveTask}>Save Task</button>
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
                        <th>Task Name</th>
                        <th>Type</th>
                        <th>Interval</th>
                        <th>Last Run</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tasks.map((tk) => (
                        <tr key={tk.id}>
                          <td><b>{tk.name}</b> {tk.folder && <small className="muted mono">({tk.folder})</small>}</td>
                          <td><span className="badge-tag">{tk.kind.toUpperCase()}</span></td>
                          <td>{tk.interval_minutes} min</td>
                          <td className="muted mono">
                            {tk.last_run ? new Date(tk.last_run * 1000).toLocaleString() : "Never"}
                          </td>
                          <td>
                            <div style={{ display: "flex", gap: "6px" }}>
                              <button className="btn btn-ghost btn-sm" onClick={() => handleRunTaskNow(tk.id)}>
                                {t.sched_run_now}
                              </button>
                              <button className="btn btn-ghost btn-sm" onClick={() => handleDeleteTask(tk.id)}>
                                ✕
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="muted" style={{ padding: "36px 0", textAlign: "center" }}>{t.sched_no_tasks}</p>
              )}
            </div>

            {taskHistory.length > 0 && (
              <div style={{ marginTop: "24px" }}>
                <b>Recent Automated Runs:</b>
                <div className="feed-box">
                  {taskHistory.map((h, i) => (
                    <div key={i} className="feed-row">
                      <span>{h.success ? "✓" : "⚠"} <b>{h.task_name}</b>: {h.summary}</span>
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

        {/* TAB 7: Smart Batch Renamer */}
        {activeTab === "renamer" && (
          <Suspense fallback={<div className="glass" style={{ padding: "40px", textAlign: "center" }}><p className="muted">Loading Batch Renamer…</p></div>}>
            <BatchRenamer />
          </Suspense>
        )}

        {/* TAB 8: Image Studio */}
        {activeTab === "images" && (
          <Suspense fallback={<div className="glass" style={{ padding: "40px", textAlign: "center" }}><p className="muted">Loading Image Studio…</p></div>}>
            <ImageStudio />
          </Suspense>
        )}

        {/* TAB 9: PDF Studio */}
        {activeTab === "pdf" && (
          <Suspense fallback={<div className="glass" style={{ padding: "40px", textAlign: "center" }}><p className="muted">Loading PDF Studio…</p></div>}>
            <PdfStudio />
          </Suspense>
        )}

        {/* TAB 10: Settings */}
        {activeTab === "settings" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            {settingsNotice && (
              <div className="glass alert alert-success">
                <span>✓ {settingsNotice}</span>
              </div>
            )}

            {/* Smart Keyword Rules Manager */}
            <section className="glass" style={{ padding: "20px 24px" }}>
              <div style={{ marginBottom: "16px" }}>
                <h3 style={{ margin: "0 0 6px 0", fontSize: "16px", fontWeight: 700 }}>
                  {t.rules_title}
                </h3>
                <p className="muted" style={{ margin: 0, fontSize: "13px" }}>
                  {t.rules_desc}
                </p>
              </div>

              {smartRules.length > 0 ? (
                <div className="table-container" style={{ marginBottom: "16px" }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Rule Name</th>
                        <th>Target Category</th>
                        <th>Matched Keywords</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {smartRules.map((r) => (
                        <tr key={r.id}>
                          <td><b>{r.name}</b></td>
                          <td><span className="cat-cell">{r.category}</span></td>
                          <td>
                            <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
                              {r.keywords.map((kw, i) => (
                                <span key={i} className="tag mono">{kw}</span>
                              ))}
                            </div>
                          </td>
                          <td>
                            <button className="btn btn-ghost btn-sm" onClick={() => handleDeleteSmartRule(r.id)}>✕</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="muted" style={{ padding: "12px 0" }}>{t.rules_no_rules}</p>
              )}

              {/* Add Rule Form */}
              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
                <input
                  type="text"
                  placeholder="Rule Name (e.g. Financial Invoices)"
                  value={newRuleName}
                  onChange={(e) => setNewRuleName(e.target.value)}
                  style={{ flex: 1, minWidth: "160px" }}
                />
                <select
                  className="btn btn-ghost"
                  value={newRuleCategory}
                  onChange={(e) => setNewRuleCategory(e.target.value)}
                >
                  {Object.keys(categories).map((c) => (
                    <option key={c} value={c}>{getCatLabel(c)}</option>
                  ))}
                </select>
                <input
                  type="text"
                  placeholder="Keywords (e.g. invoice, bill, receipt)"
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
            <section className="glass">
              <div className="dupes-header" style={{ padding: "20px 24px 0" }}>
                <div>
                  <h3>{t.settings_cat_title}</h3>
                  <p className="muted" style={{ margin: "4px 0 0" }}>{t.settings_cat_desc}</p>
                </div>
                <div className="summary-actions">
                  <button className="btn btn-primary" onClick={saveSettings}>{t.settings_btn_save}</button>
                  <button className="btn btn-ghost" onClick={resetSettings}>{t.settings_btn_reset}</button>
                </div>
              </div>

              <div className="settings-grid" style={{ padding: "20px 24px" }}>
                {Object.entries(categories).map(([cat, exts]) => (
                  <div key={cat} className="glass cat-box">
                    <div className="cat-box-header">
                      <span>{CATEGORY_ICONS[cat] ?? "•"} {getCatLabel(cat)}</span>
                      <span className="muted mono" style={{ fontSize: "11px" }}>
                        {fmtNum(exts.length)} {t.settings_formats_count}
                      </span>
                    </div>
                    <div className="tags">
                      {exts.map((e) => (
                        <span key={e} className="tag mono">
                          {e}
                          <button onClick={() => removeExtension(cat, e)} title="Remove">✕</button>
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
        )}
        </div>
      </main>
    </div>
  );
}
