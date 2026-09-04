/**
 * External store + React bindings.
 *
 * Same idea as the vanilla UI's global State object, but typed and
 * consumed through useSyncExternalStore. Holds the phase machine
 * (idle -> analysis -> sorting -> done), the live analysis/sort data,
 * and every action the UI can take; backend-pushed events flow into it
 * through subscribeEvents (registered once at init).
 */

import { useSyncExternalStore } from 'react';

import type {
  AnalysisReport,
  AppState,
  CategoryMeta,
  BinEmptyResult,
  BinStatus,
  CleanDone,
  CleanLocationId,
  DriveInfo,
  DuplicateMode,
  DupDone,
  LangCode,
  PlanItem,
  SortDone,
  SortItemEvent,
  SpaceDone,
  TaskDef,
  TaskHistoryEntry,
  TaskKind,
  ThemeName,
  UndoDone,
  WatchError,
  WatchItem,
} from './protocol';
import { DEFAULT_CATEGORY_META } from './protocol';
import { bridge, isDesktop, subscribeEvents, transportKind } from './transport';
import type { TransportKind } from './transport';
import type { SortEvent } from './transport';
import type { StringTable } from './i18n';
import { fmt, inline, t } from './i18n';
import { formatSize } from './utils';

// ── Scheduled-task i18n helpers (v5.9.0) ────────────────────────

export const TASK_INTERVALS: { minutes: number; key: string }[] = [
  { minutes: 30, key: 'task_interval_30m' },
  { minutes: 60, key: 'task_interval_1h' },
  { minutes: 180, key: 'task_interval_3h' },
  { minutes: 360, key: 'task_interval_6h' },
  { minutes: 720, key: 'task_interval_12h' },
  { minutes: 1440, key: 'task_interval_1d' },
  { minutes: 10080, key: 'task_interval_7d' },
];

export function taskKindKey(kind: TaskKind): string {
  return `task_kind_${kind}`;
}

export function taskSummaryKey(kind: TaskKind): string {
  return `task_summary_${kind}`;
}

export function taskSummaryArgs(p: TaskHistoryEntry): Record<string, string | number> {
  const bytes = formatSize(p.bytes ?? 0);
  return p.kind === 'dup_scan'
    ? { groups: p.groups ?? 0, bytes }
    : { files: p.files ?? 0, bytes };
}

export interface CategoryRow {
  id: string;
  icon: string;
  name: string;
  extensions: string[];
  count: number;
}

export type Phase = 'idle' | 'analyzing' | 'analysis' | 'sorting' | 'done';
export type LogKind = 'success' | 'warning' | 'error' | 'info';

export interface LogLine {
  id: number;
  kind: LogKind;
  text: string;
}

export interface Notice {
  kind: 'success' | 'error' | 'info';
  text: string;
}

export interface DupFileRow {
  path: string;
  size: number;
  /** True = this copy is marked for deletion (at least one per group stays). */
  markDelete: boolean;
}

export interface DupGroupRow {
  id: string;
  size: number;
  files: DupFileRow[];
}

export type DupScanPhase = 'idle' | 'listing' | 'hashing';

export interface WatchRow {
  path: string;
  moved: number;
  skipped: number;
  failed: number;
}

export interface UIState {
  ready: boolean;
  desktop: boolean;
  transport: TransportKind;
  theme: ThemeName;
  lang: LangCode;
  version: string;
  strings: StringTable;
  folder: string | null;
  recentFolders: string[];
  categories: CategoryRow[];
  phase: Phase;
  move: boolean;
  dupMode: DuplicateMode;
  report: AnalysisReport | null;
  plan: PlanItem[] | null;
  dryRunOpen: boolean;
  totalFiles: number;
  processed: number;
  okCount: number;
  skipCount: number;
  errorCount: number;
  logs: LogLine[];
  result: (SortDone & { kind: 'sort' }) | (UndoDone & { kind: 'undo' }) | null;
  undoOpen: boolean;
  settingsOpen: boolean;
  watchOpen: boolean;
  watchRunning: boolean;
  watchFolders: WatchRow[];
  watchLog: LogLine[];
  dupOpen: boolean;
  dupScanning: boolean;
  dupScanFolder: string | null;
  dupPhase: DupScanPhase;
  dupProcessed: number;
  dupTotal: number;
  dupGroups: DupGroupRow[];
  dupCancelled: boolean;
  diskOpen: boolean;
  drives: DriveInfo[];
  drivesLoaded: boolean;
  diskScanning: boolean;
  diskScanFolder: string | null;
  diskProcessed: number;
  diskBytes: number;
  diskReport: SpaceDone | null;
  cleanOpen: boolean;
  cleanScanning: boolean;
  cleanReport: CleanDone | null;
  cleanSel: Set<CleanLocationId>;
  cleanArmed: boolean;
  cleanDeleting: boolean;
  binStatus: BinStatus | null;
  binLoading: boolean;
  binArmed: boolean;
  binEmptying: boolean;
  tasks: TaskDef[];
  tasksHistory: TaskHistoryEntry[];
  tasksOpen: boolean;
  runningTasks: Set<string>;
  notice: Notice | null;
}

const initial: UIState = {
  ready: false,
  desktop: isDesktop(),
  transport: transportKind,
  theme: 'dark',
  lang: 'en',
  version: '',
  strings: {},
  folder: null,
  recentFolders: [],
  categories: [],
  phase: 'idle',
  move: false,
  dupMode: 'skip',
  report: null,
  plan: null,
  dryRunOpen: false,
  totalFiles: 0,
  processed: 0,
  okCount: 0,
  skipCount: 0,
  errorCount: 0,
  logs: [],
  result: null,
  undoOpen: false,
  settingsOpen: false,
  watchOpen: false,
  watchRunning: false,
  watchFolders: [],
  watchLog: [],
  dupOpen: false,
  dupScanning: false,
  dupScanFolder: null,
  dupPhase: 'idle',
  dupProcessed: 0,
  dupTotal: 0,
  dupGroups: [],
  dupCancelled: false,
  diskOpen: false,
  drives: [],
  drivesLoaded: false,
  diskScanning: false,
  diskScanFolder: null,
  diskProcessed: 0,
  diskBytes: 0,
  diskReport: null,
  cleanOpen: false,
  cleanScanning: false,
  cleanReport: null,
  cleanSel: new Set<CleanLocationId>(),
  cleanArmed: false,
  cleanDeleting: false,
  binStatus: null,
  binLoading: false,
  binArmed: false,
  binEmptying: false,
  notice: null,
  tasks: [],
  tasksHistory: [],
  tasksOpen: false,
  runningTasks: new Set<string>(),
};

let state: UIState = initial;
let appState: AppState | null = null;
let logId = 0;
const listeners = new Set<() => void>();

function set(patch: Partial<UIState>): void {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): UIState {
  return state;
}

// ── Localized helpers bound to the current state ────────────────

// Sorting a big folder emits one log row per file; rendering them all
// unbounded grows the DOM to tens of thousands of nodes and re-renders
// them on every event, which freezes the page. Keep a bounded ring so
// the tail of the log stays live and the DOM stays cheap.
const MAX_LOG_LINES = 250;

function pushLog(kind: LogKind, text: string): void {
  logId += 1;
  set({ logs: [...state.logs.slice(-(MAX_LOG_LINES - 1)), { id: logId, kind, text }] });
}

// ── Client-side event batching (v6.1.2) ─────────────────────────
// The service coalescer (v6.1.1) already bounds wire traffic, but the
// browser still handled every "item" frame individually — three full
// store updates (log row + category + counter) per file, each
// re-rendering the whole tree. On a fast sort that is hundreds of
// renders per second. Instead we accumulate hot events here and apply
// them in one set() on a short timer, so a burst of N files costs one
// render instead of ~3N.

let pendingLogs: LogLine[] = [];
let pendingWatchLogs: LogLine[] = [];
let pendingCat: Record<string, number> = {};
let pendingOk = 0;
let pendingSkip = 0;
let pendingErr = 0;
let pendingBumps: { path: string; field: 'moved' | 'skipped' | 'failed' }[] = [];
let pendingTimer: ReturnType<typeof setTimeout> | null = null;

const BATCH_INTERVAL_MS = 120; // aligns with the backend coalescer flush

function scheduleBatchFlush(): void {
  if (pendingTimer !== null) return;
  pendingTimer = setTimeout(flushBatch, BATCH_INTERVAL_MS);
}

/** Apply every buffered item/watch update in a single store set(). */
function flushBatch(): void {
  pendingTimer = null;
  const logs = pendingLogs;
  const watchLogs = pendingWatchLogs;
  const catDeltas = pendingCat;
  const ok = pendingOk;
  const skip = pendingSkip;
  const err = pendingErr;
  const bumps = pendingBumps;
  pendingLogs = [];
  pendingWatchLogs = [];
  pendingCat = {};
  pendingOk = 0;
  pendingSkip = 0;
  pendingErr = 0;
  pendingBumps = [];
  if (
    logs.length === 0 &&
    watchLogs.length === 0 &&
    ok === 0 &&
    skip === 0 &&
    err === 0 &&
    Object.keys(catDeltas).length === 0 &&
    bumps.length === 0
  ) {
    return;
  }
  const patch: Partial<UIState> = {};
  if (logs.length > 0) {
    patch.logs = [...state.logs, ...logs].slice(-MAX_LOG_LINES);
  }
  if (watchLogs.length > 0) {
    patch.watchLog = [...state.watchLog, ...watchLogs].slice(-50);
  }
  if (ok > 0 || skip > 0 || err > 0) {
    patch.okCount = state.okCount + ok;
    patch.skipCount = state.skipCount + skip;
    patch.errorCount = state.errorCount + err;
  }
  const catIds = Object.keys(catDeltas);
  if (catIds.length > 0) {
    patch.categories = state.categories.map((c) => {
      const d = catDeltas[c.id];
      return d ? { ...c, count: Math.max(0, c.count + d) } : c;
    });
  }
  if (bumps.length > 0) {
    const byPath = new Map<string, Partial<WatchRow>>();
    for (const b of bumps) {
      const row = byPath.get(b.path) ?? {};
      row[b.field] = (row[b.field] ?? 0) + 1;
      byPath.set(b.path, row);
    }
    patch.watchFolders = state.watchFolders.map((r) => {
      const d = byPath.get(r.path);
      return d
        ? {
            ...r,
            moved: r.moved + (d.moved ?? 0),
            skipped: r.skipped + (d.skipped ?? 0),
            failed: r.failed + (d.failed ?? 0),
          }
        : r;
    });
  }
  set(patch);
}

/** Events that end a phase must land after the rows/counters that
 *  preceded them — drain any buffered items first. */
const BATCH_FLUSH_KINDS = new Set(['total', 'done', 'error']);

function showNotice(kind: Notice['kind'], text: string): void {
  set({ notice: { kind, text } });
}

function mergeWatchRows(paths: string[], prev: WatchRow[]): WatchRow[] {
  return paths.map((path) => {
    const old = prev.find((r) => r.path === path);
    return old ?? { path, moved: 0, skipped: 0, failed: 0 };
  });
}

function categoryDisplay(id: string): string {
  const row = state.categories.find((c) => c.id === id);
  return row?.name ?? id;
}

function pushWatchLog(kind: LogKind, text: string): void {
  logId += 1;
  const line = { id: logId, kind, text };
  set({ watchLog: [...state.watchLog.slice(-49), line] });
}

// ── Row building ────────────────────────────────────────────────

function buildRows(app: AppState, lang: LangCode): CategoryRow[] {
  const ids = Object.keys(app.categories);
  const sorted = [...ids].sort((a, b) => {
    if (a === 'others') return 1;
    if (b === 'others') return -1;
    return a.localeCompare(b);
  });
  return sorted.map((id) => {
    const meta: Partial<CategoryMeta> = app.categoryMeta?.[id] ?? {};
    const fallback = DEFAULT_CATEGORY_META[id];
    const icon = meta.icon || fallback?.icon || '📁';
    const name =
      (lang === 'fa'
        ? meta.nameFa ?? fallback?.nameFa
        : meta.nameEn ?? fallback?.nameEn) ?? id;
    return { id, icon, name, extensions: app.categories[id] ?? [], count: 0 };
  });
}

function applyCategoryCounts(byCategory: Record<string, number>): void {
  set({
    categories: state.categories.map((c) => ({
      ...c,
      count: byCategory[c.id] ?? 0,
    })),
  });
}

function resetCounts(): void {
  applyCategoryCounts({});
}

// ── Theme / language helpers ────────────────────────────────────

function applyTheme(theme: ThemeName): void {
  document.documentElement.dataset.theme = theme;
}

// ── Backend event handling ──────────────────────────────────────

function localizeItem(item: SortItemEvent): string {
  const S = state.strings;
  const name = item.name ?? '?';
  const category = item.category ?? '';
  switch (item.status) {
    case 'ok': {
      const tpl = item.action === 'moved' ? t(S, 'moved_log') : t(S, 'copied_log');
      return inline(fmt(tpl, { name, category }));
    }
    case 'skip':
      return inline(fmt(t(S, 'skipped_log'), { name }));
    case 'error':
      return inline(fmt(t(S, 'error_log'), { name, error: item.error ?? '' }));
    case 'restored':
      return inline(fmt(t(S, 'undo_restored_log'), { name }));
    case 'removed':
      return inline(fmt(t(S, 'undo_removed_log'), { name }));
    case 'failed':
      return inline(fmt(t(S, 'undo_failed_log'), { name, error: item.error ?? '' }));
  }
}

function handleEvent(msg: SortEvent): void {
  const { kind, payload } = msg;
  // Phase-ending events must observe every row/counter emitted before
  // them, so drain the batch buffer synchronously first.
  if (BATCH_FLUSH_KINDS.has(kind)) {
    flushBatch();
  }
  switch (kind) {
    case 'total': {
      const total = payload as number;
      set({
        totalFiles: total,
        processed: 0,
        okCount: 0,
        skipCount: 0,
        errorCount: 0,
      });
      resetCounts();
      break;
    }
    case 'item': {
      const item = payload as SortItemEvent;
      logId += 1;
      pendingLogs.push({
        id: logId,
        kind:
          item.status === 'ok' || item.status === 'restored'
            ? 'success'
            : item.status === 'skip' || item.status === 'removed'
              ? 'warning'
              : 'error',
        text: localizeItem(item),
      });
      if (item.status === 'ok' && item.category) {
        pendingCat[item.category] = (pendingCat[item.category] ?? 0) + 1;
        pendingOk += 1;
      } else if (item.status === 'skip') {
        pendingSkip += 1;
      } else if (item.status === 'error') {
        pendingErr += 1;
      }
      scheduleBatchFlush();
      break;
    }
    case 'progress':
      set({ processed: payload as number });
      break;
    case 'done': {
      const p = payload as SortDone | UndoDone;
      if ('nothing' in p) {
        if (p.nothing) {
          pushLog('info', inline(t(state.strings, 'undo_nothing_msg')));
          showNotice('info', inline(t(state.strings, 'undo_nothing_title')));
          set({ phase: 'idle', result: null, totalFiles: 0, processed: 0 });
        } else {
          const line = fmt(t(state.strings, 'undo_done_log'), {
            restored: p.restored,
            removed: p.removed,
            failed: p.failed,
          });
          pushLog('success', inline(line));
          showNotice('success', inline(line));
          set({ phase: 'idle', result: null });
        }
      } else {
        const line = fmt(t(state.strings, 'done_log'), {
          copied: p.copied,
          skipped: p.skipped,
          errors: p.errors,
          target: p.target_dir,
        });
        pushLog('success', inline(line));
        showNotice('success', inline(t(state.strings, 'done_log_title')));
        set({ phase: 'done', result: { ...p, kind: 'sort' } });
      }
      break;
    }
    case 'watch_item': {
      const item = payload as WatchItem;
      const S = state.strings;
      const category = categoryDisplay(item.category);
      logId += 1;
      if (item.action === 'moved') {
        pendingWatchLogs.push({
          id: logId,
          kind: 'success',
          text: inline(fmt(t(S, 'watch_sorted_log'), { name: item.name, category })),
        });
        pendingBumps.push({ path: item.folder, field: 'moved' });
      } else if (item.action === 'skipped') {
        pendingWatchLogs.push({
          id: logId,
          kind: 'warning',
          text: inline(fmt(t(S, 'watch_skipped_log'), { name: item.name })),
        });
        pendingBumps.push({ path: item.folder, field: 'skipped' });
      } else {
        pendingWatchLogs.push({
          id: logId,
          kind: 'error',
          text: inline(
            fmt(t(S, 'watch_error_log'), { name: item.name, error: item.error ?? '' }),
          ),
        });
        pendingBumps.push({ path: item.folder, field: 'failed' });
      }
      scheduleBatchFlush();
      break;
    }
    case 'watch_error': {
      const we = payload as WatchError;
      pushWatchLog(
        'error',
        inline(
          fmt(t(state.strings, 'watch_folder_error_log'), {
            path: we.folder,
            error: we.message,
          }),
        ),
      );
      break;
    }
    case 'dup_progress': {
      const p = payload as { phase: 'listing' | 'hashing'; processed: number; total: number };
      set({
        dupScanning: true,
        dupPhase: p.phase,
        dupProcessed: p.processed,
        dupTotal: p.total,
      });
      break;
    }
    case 'dup_done': {
      const p = payload as DupDone;
      const rows: DupGroupRow[] = p.groups.map((g) => ({
        id: g.id,
        size: g.size,
        files: g.files.map((f, i) => ({
          path: f.path,
          size: f.size,
          markDelete: i > 0, // keep the first copy of each group by default
        })),
      }));
      set({ dupScanning: false, dupPhase: 'idle', dupGroups: rows, dupCancelled: p.cancelled === true });
      break;
    }
    case 'space_progress': {
      const p = payload as { phase: 'scanning'; processed: number; bytes: number };
      set({
        diskScanning: true,
        diskProcessed: p.processed,
        diskBytes: p.bytes,
      });
      break;
    }
    case 'space_done': {
      set({
        diskScanning: false,
        diskProcessed: 0,
        diskBytes: 0,
        diskReport: payload as SpaceDone,
      });
      break;
    }
    case 'clean_progress': {
      // Keep the panel honest while scanning: no fake empty results.
      set({ cleanScanning: true });
      break;
    }
    case 'clean_done': {
      const done = payload as CleanDone;
      const live = done.locations.filter((l) => l.files > 0 || l.bytes > 0);
      set({
        cleanScanning: false,
        cleanReport: { ...done, locations: live },
        cleanSel: new Set(live.map((l) => l.id)),
        cleanArmed: false,
      });
      break;
    }
    case 'sched_run': {
      const p = payload as { task_id: string };
      const running = new Set(state.runningTasks);
      running.add(p.task_id);
      set({ runningTasks: running });
      break;
    }
    case 'sched_done': {
      const p = payload as TaskHistoryEntry;
      const running = new Set(state.runningTasks);
      running.delete(p.task_id);
      const tasks = state.tasks.map((t) =>
        t.id === p.task_id
          ? { ...t, last_run: p.ok ? Math.floor(p.at) : t.last_run }
          : t,
      );
      const history = [p, ...state.tasksHistory.filter((h) => h.task_id !== p.task_id)].slice(0, 20);
      set({ runningTasks: running, tasks, tasksHistory: history });
      // A toast keeps the user informed when a scheduled job finishes.
      const kindName = t(state.strings, taskKindKey(p.kind));
      if (p.ok) {
        const summary = inline(
          fmt(t(state.strings, taskSummaryKey(p.kind)), taskSummaryArgs(p)),
        );
        showNotice('success', `${kindName} — ${summary}`);
      } else {
        showNotice('error', `${kindName}: ${inline(t(state.strings, 'task_failed'))}`);
      }
      break;
    }
    case 'error': {
      const message = String(payload);
      pushLog('error', inline(fmt(t(state.strings, 'fatal_error_log'), { error: message })));
      showNotice('error', message);
      // Any job thread can fail mid-run; clear every operation flag so no
      // panel is left on an eternal spinner.
      set({
        phase: 'idle',
        result: null,
        dupScanning: false,
        diskScanning: false,
        cleanScanning: false,
        cleanDeleting: false,
        binEmptying: false,
      });
      break;
    }
  }
}
// ── Public actions ──────────────────────────────────────────────

export async function init(): Promise<void> {
  // Events may arrive before state is loaded (sort started elsewhere);
  // register first, then fetch state/strings.
  subscribeEvents(handleEvent);
  try {
    const app = await bridge.get_state();
    appState = app;
    const strings = await bridge.get_strings(app.language);
    applyTheme(app.theme);
    document.documentElement.lang = app.language;
    document.documentElement.dir = app.language === 'fa' ? 'rtl' : 'ltr';
    set({
      ready: true,
      theme: app.theme,
      lang: app.language,
      version: app.version,
      strings,
      recentFolders: app.recentFolders ?? [],
      watchFolders: mergeWatchRows(app.watchedFolders ?? [], []),
      tasks: app.tasks ?? [],
      categories: buildRows(app, app.language),
    });
  } catch (err) {
    console.error('init failed:', err);
    set({ ready: true });
  }
}

export function setFolder(folder: string | null): void {
  set({
    folder,
    phase: 'idle',
    report: null,
    plan: null,
    dryRunOpen: false,
    result: null,
    logs: [],
  });
}

export async function browseFolder(): Promise<boolean> {
  const path = await bridge.browse_folder();
  if (path) {
    setFolder(path);
    pushLog('info', inline(fmt(t(state.strings, 'folder_selected_log'), { path })));
    return true;
  }
  return false;
}

export function pickRecent(path: string): void {
  setFolder(path);
}

export async function analyzeFolder(): Promise<void> {
  if (!state.folder || state.phase !== 'idle') return;
  set({ phase: 'analyzing' });
  try {
    const report = await bridge.analyze_folder(state.folder);
    if (report.error) {
      showNotice('error', report.error);
      set({ phase: 'idle' });
      return;
    }
    set({
      report,
      totalFiles: report.total,
      phase: 'analysis',
      plan: null,
      dryRunOpen: false,
    });
    applyCategoryCounts(report.by_category);
  } catch (err) {
    showNotice('error', String(err));
    set({ phase: 'idle' });
  }
}

export function closeAnalysis(): void {
  set({ phase: 'idle', plan: null, dryRunOpen: false });
}

export async function loadPlan(mode: DuplicateMode): Promise<void> {
  if (!state.folder) return;
  try {
    const plan = await bridge.plan_sort(state.folder, mode);
    set({ plan, dryRunOpen: true });
  } catch (err) {
    showNotice('error', String(err));
  }
}

export function toggleDryRun(open: boolean): void {
  set({ dryRunOpen: open });
}

export function setMove(move: boolean): void {
  set({ move });
}

export function setDupMode(mode: DuplicateMode): void {
  set({ dupMode: mode });
}

export async function runSort(): Promise<void> {
  if (!state.folder) return;
  set({
    phase: 'sorting',
    result: null,
    totalFiles: 0,
    processed: 0,
    okCount: 0,
    skipCount: 0,
    errorCount: 0,
    logs: [],
  });
  resetCounts();
  try {
    await bridge.start_sort(state.folder, state.move, state.dupMode);
  } catch (err) {
    showNotice('error', String(err));
    set({ phase: 'idle' });
  }
}

export async function runUndo(): Promise<void> {
  set({
    phase: 'sorting',
    result: null,
    totalFiles: 0,
    processed: 0,
    okCount: 0,
    skipCount: 0,
    errorCount: 0,
    logs: [],
  });
  try {
    await bridge.undo_sort();
  } catch (err) {
    showNotice('error', String(err));
    set({ phase: 'idle' });
  }
}

export function resetApp(): void {
  setFolder(state.folder);
}

// ── Modals: undo preview + settings ────────────────────────────

export function openUndoModal(): void {
  set({ undoOpen: true });
}

export function closeUndoModal(): void {
  set({ undoOpen: false });
}

export function openSettings(): void {
  set({ settingsOpen: true });
}

export function closeSettings(): void {
  set({ settingsOpen: false });
}

// ── Settings: editable draft snapshot + persistence ────────────

export interface CategoryDraft {
  id: string;
  icon: string;
  nameEn: string;
  nameFa: string;
  extensions: string[];
}

export interface RuleDraft {
  keywords: string; // comma-separated raw text while editing
  category: string;
}

/** Raw editable snapshot of the smart rules. */
export function rulesSnapshot(): RuleDraft[] {
  const app = appState;
  if (!app) return [];
  return (app.smartRules ?? []).map((r) => ({
    keywords: (r.keywords ?? []).join(', '),
    category: r.category,
  }));
}

/** Raw editable snapshot of the categories (incl. built-in fallbacks). */
export function settingsSnapshot(): CategoryDraft[] {
  const app = appState;
  if (!app) return [];
  const meta = app.categoryMeta ?? {};
  const entries = Object.entries(app.categories).map(([id, exts]) => {
    const m = meta[id] ?? {};
    const fb = DEFAULT_CATEGORY_META[id];
    return {
      id,
      icon: m.icon || fb?.icon || '📁',
      nameEn: m.nameEn || fb?.nameEn || id,
      nameFa: m.nameFa || fb?.nameFa || id,
      extensions: [...exts],
    };
  });
  return [...entries].sort((a, b) => {
    if (a.id === 'others') return 1;
    if (b.id === 'others') return -1;
    return a.id.localeCompare(b.id);
  });
}

function syncFromApp(app: AppState): void {
  applyTheme(app.theme);
  document.documentElement.lang = app.language;
  document.documentElement.dir = app.language === 'fa' ? 'rtl' : 'ltr';
  set({
    theme: app.theme,
    lang: app.language,
    version: app.version,
    strings: state.strings,
    recentFolders: app.recentFolders ?? [],
    categories: buildRows(app, app.language),
  });
}

export async function saveSettings(
  drafts: CategoryDraft[],
  rules: RuleDraft[] = [],
): Promise<boolean> {
  const categories: Record<string, string[]> = {};
  const meta: Record<string, Partial<CategoryMeta>> = {};
  for (const d of drafts) {
    categories[d.id] = d.extensions;
    meta[d.id] = { icon: d.icon, nameEn: d.nameEn, nameFa: d.nameFa };
  }
  const cleanRules = rules
    .map((r) => ({
      keywords: r.keywords
        .split(',')
        .map((k) => k.trim())
        .filter(Boolean),
      category: r.category,
    }))
    .filter((r) => r.keywords.length > 0 && categories[r.category] !== undefined);
  try {
    await bridge.save_categories(categories, meta);
    await bridge.save_smart_rules(cleanRules);
    const fresh = await bridge.get_state();
    appState = fresh;
    syncFromApp(fresh);
    set({ settingsOpen: false, phase: 'idle' });
    const saved = inline(t(state.strings, 'settings_saved_log'));
    pushLog('success', saved);
    showNotice('success', saved);
    return true;
  } catch (err) {
    showNotice('error', String(err));
    return false;
  }
}

export async function restoreDefaults(): Promise<boolean> {
  try {
    await bridge.restore_defaults();
    const fresh = await bridge.get_state();
    appState = fresh;
    syncFromApp(fresh);
    return true;
  } catch (err) {
    showNotice('error', String(err));
    return false;
  }
}

export async function toggleTheme(): Promise<void> {
  const theme = await bridge.toggle_theme();
  applyTheme(theme);
  set({ theme });
}

export async function toggleLanguage(): Promise<void> {
  const lang = await bridge.toggle_language();
  const strings = await bridge.get_strings(lang);
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'fa' ? 'rtl' : 'ltr';
  set({
    lang,
    strings,
    categories: appState ? buildRows(appState, lang) : state.categories,
  });
}

export function clearNotice(): void {
  set({ notice: null });
}

// ── Watch mode (auto-sort folders) ───────────────────────────────

export function openWatch(): void {
  set({ watchOpen: true });
}

export function closeWatch(): void {
  set({ watchOpen: false });
}

async function refreshWatchFolders(): Promise<void> {
  const app = await bridge.get_state();
  appState = app;
  set({ watchFolders: mergeWatchRows(app.watchedFolders ?? [], state.watchFolders) });
}

export async function watchBrowseAdd(): Promise<void> {
  const path = await bridge.browse_folder();
  if (!path) return;
  try {
    await bridge.add_watch_folder(path);
    pushWatchLog(
      'info',
      inline(fmt(t(state.strings, 'watch_added_log'), { path })),
    );
    await refreshWatchFolders();
  } catch (err) {
    showNotice('error', String(err));
  }
}

export async function watchAddCurrent(): Promise<void> {
  const path = state.folder;
  if (!path) return;
  try {
    await bridge.add_watch_folder(path);
    pushWatchLog(
      'info',
      inline(fmt(t(state.strings, 'watch_added_log'), { path })),
    );
    await refreshWatchFolders();
  } catch (err) {
    showNotice('error', String(err));
  }
}

export async function watchRemove(path: string): Promise<void> {
  try {
    await bridge.remove_watch_folder(path);
    pushWatchLog(
      'info',
      inline(fmt(t(state.strings, 'watch_removed_log'), { path })),
    );
    set({ watchFolders: state.watchFolders.filter((r) => r.path !== path) });
  } catch (err) {
    showNotice('error', String(err));
  }
}

export async function watchStart(): Promise<void> {
  try {
    await bridge.start_watch();
    pushWatchLog('success', inline(t(state.strings, 'watch_started_log')));
    showNotice('success', inline(t(state.strings, 'watch_started_log')));
    set({ watchRunning: true });
  } catch (err) {
    showNotice('error', String(err));
  }
}

export async function watchStop(): Promise<void> {
  try {
    await bridge.stop_watch();
    pushWatchLog('info', inline(t(state.strings, 'watch_stopped_log')));
    set({ watchRunning: false });
  } catch (err) {
    showNotice('error', String(err));
  }
}

// ── Duplicate finder ──────────────────────────────────────────────

export function openDupPanel(): void {
  set({ dupOpen: true });
  if (!state.drivesLoaded) {
    void loadDrives();
  }
}

export function closeDupPanel(): void {
  set({
    dupOpen: false,
    dupScanning: false,
    dupScanFolder: null,
    dupPhase: 'idle',
    dupGroups: [],
  });
}

async function startDupScan(path: string): Promise<void> {
  set({
    dupScanning: true,
    dupScanFolder: path,
    dupPhase: 'listing',
    dupProcessed: 0,
    dupTotal: 0,
    dupGroups: [],
    dupCancelled: false,
  });
  try {
    await bridge.find_duplicates(path);
  } catch (err) {
    showNotice('error', String(err));
    set({ dupScanning: false });
  }
}

export async function dupScanCurrent(): Promise<void> {
  if (!state.folder) return;
  await startDupScan(state.folder);
}

export async function dupScanDrive(drive: DriveInfo): Promise<void> {
  if (state.dupScanning) return;
  await startDupScan(drive.path);
}

export async function dupScanBrowse(): Promise<void> {
  const path = await bridge.browse_folder();
  if (!path) return;
  await startDupScan(path);
}

export async function dupScanFolder(): Promise<void> {
  // Duplicates panel with a folder already set (e.g. after reopening).
  const path = state.dupScanFolder ?? state.folder;
  if (!path) return;
  await startDupScan(path);
}

/** Toggle whether one copy is marked for deletion; never unmarks the
 *  last remaining keeper of a group (one copy must always stay). */
export function toggleDupFile(groupId: string, path: string): void {
  set({
    dupGroups: state.dupGroups.map((g) => {
      if (g.id !== groupId) return g;
      const keepers = g.files.filter((f) => !f.markDelete);
      const target = g.files.find((f) => f.path === path);
      if (!target) return g;
      const wouldUnmark = !target.markDelete && keepers.length === 1;
      if (wouldUnmark) return g; // last keeper cannot be marked for deletion
      return {
        ...g,
        files: g.files.map((f) =>
          f.path === path ? { ...f, markDelete: !f.markDelete } : f,
        ),
      };
    }),
  });
}

export async function deleteSelectedDupes(): Promise<void> {
  const marked = state.dupGroups.flatMap((g) =>
    g.files.filter((f) => f.markDelete).map((f) => ({ ...f, groupId: g.id })),
  );
  const paths = marked.map((f) => f.path);
  if (paths.length === 0) return;
  const freedBytes = marked.reduce((n, f) => n + f.size, 0);
  try {
    const res = await bridge.delete_duplicates(paths);
    const deletedSet = new Set(res.deleted);
    set({
      dupGroups: state.dupGroups
        .map((g) => ({
          ...g,
          files: g.files.filter((f) => !deletedSet.has(f.path)),
        }))
        .filter((g) => g.files.length >= 2), // a lone copy is no longer a duplicate
    });
    if (res.deleted.length > 0) {
      const msg = inline(
        fmt(t(state.strings, 'dup_deleted_log'), {
          n: res.deleted.length,
          size: formatSize(freedBytes),
        }),
      );
      pushLog('success', msg);
      showNotice('success', msg);
    }
    const firstFail = res.failed[0];
    if (firstFail) {
      const pathOnly = firstFail.path.split(/[\/]/).pop() ?? firstFail.path;
      showNotice(
        'error',
        inline(
          fmt(t(state.strings, 'dup_delete_failed_log'), {
            name: pathOnly,
            error: firstFail.error,
          }),
        ),
      );
    }
  } catch (err) {
    showNotice('error', String(err));
  }
}

// ── Disk space analysis ────────────────────────────────────────

export function openDiskPanel(): void {
  set({ diskOpen: true });
  if (!state.drivesLoaded) {
    void loadDrives();
  }
}

export async function loadDrives(): Promise<void> {
  try {
    const drives = await bridge.list_drives();
    set({ drives, drivesLoaded: true });
  } catch (err) {
    // Non-Windows or a service hiccup — the panel just shows folder scans.
    set({ drivesLoaded: true });
    showNotice('error', String(err));
  }
}

export function closeDiskPanel(): void {
  set({
    diskOpen: false,
    diskScanning: false,
    diskScanFolder: null,
    diskProcessed: 0,
    diskBytes: 0,
    diskReport: null,
  });
}

async function startDiskScan(path: string): Promise<void> {
  set({
    diskScanning: true,
    diskScanFolder: path,
    diskProcessed: 0,
    diskBytes: 0,
    diskReport: null,
  });
  try {
    await bridge.scan_disk(path);
  } catch (err) {
    showNotice('error', String(err));
    set({ diskScanning: false });
  }
}

export async function diskScanCurrent(): Promise<void> {
  if (!state.folder) return;
  await startDiskScan(state.folder);
}

export async function diskScanBrowse(): Promise<void> {
  const path = await bridge.browse_folder();
  if (!path) return;
  await startDiskScan(path);
}

export async function diskScanDrive(drive: DriveInfo): Promise<void> {
  if (diskScanning()) return;
  await startDiskScan(drive.path);
}

export async function cancelScan(): Promise<void> {
  try {
    await bridge.cancel_scan();
  } catch (err) {
    showNotice('error', String(err));
  }
}

// ── Scheduled tasks (v5.9.0) ────────────────────────────────────

export function openTasksPanel(): void {
  set({ tasksOpen: true });
  if (state.tasksHistory.length === 0) {
    void loadTaskHistory();
  }
}

export function closeTasksPanel(): void {
  set({ tasksOpen: false });
}

export async function loadTaskHistory(): Promise<void> {
  try {
    const history = await bridge.get_task_history();
    set({ tasksHistory: history });
  } catch (err) {
    showNotice('error', String(err));
  }
}

export async function addScheduledTask(
  kind: TaskKind,
  folder: string | null,
  intervalMinutes: number,
): Promise<void> {
  try {
    const task = await bridge.add_task(kind, folder, intervalMinutes);
    set({ tasks: [...state.tasks.filter((x) => x.id !== task.id), task] });
    showNotice('success', inline(t(state.strings, 'task_added_toast')));
  } catch (err) {
    showNotice('error', String(err));
  }
}

export async function updateScheduledTask(
  taskId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  try {
    const updated = await bridge.update_task(taskId, patch);
    set({
      tasks: state.tasks.map((x) => (x.id === taskId ? updated : x)),
    });
  } catch (err) {
    showNotice('error', String(err));
  }
}

export async function removeScheduledTask(taskId: string): Promise<void> {
  try {
    await bridge.remove_task(taskId);
    set({ tasks: state.tasks.filter((x) => x.id !== taskId) });
  } catch (err) {
    showNotice('error', String(err));
  }
}

export async function runTaskNow(taskId: string): Promise<void> {
  try {
    await bridge.run_task_now(taskId);
  } catch (err) {
    showNotice('error', String(err));
  }
}

function diskScanning(): boolean {
  return state.diskScanning;
}

export async function diskScanFolder(): Promise<void> {
  const path = state.diskScanFolder ?? state.folder;
  if (!path) return;
  await startDiskScan(path);
}

// ── Temp / cache cleanup ──────────────────────────────────────

export function openCleanPanel(): void {
  set({ cleanOpen: true, binArmed: false });
  void refreshRecycleBin();
}

export function closeCleanPanel(): void {
  set({
    cleanOpen: false,
    cleanScanning: false,
    cleanReport: null,
    cleanSel: new Set(),
    cleanArmed: false,
    cleanDeleting: false,
    binStatus: null,
    binLoading: false,
    binArmed: false,
    binEmptying: false,
  });
}

export async function refreshRecycleBin(): Promise<void> {
  set({ binLoading: true });
  try {
    const status = await bridge.recycle_bin_status();
    set({ binStatus: status, binLoading: false, binArmed: false });
  } catch (err) {
    set({ binLoading: false });
    showNotice('error', String(err));
  }
}

export async function emptyRecycleBin(): Promise<void> {
  if (state.binEmptying) return;
  const s = state.binStatus;
  if (!s?.available || s.files === 0) return;
  if (!state.binArmed) {
    set({ binArmed: true });
    return;
  }
  set({ binEmptying: true, binArmed: false });
  try {
    const res: BinEmptyResult = await bridge.empty_recycle_bin();
    set({ binEmptying: false });
    if (res.ok) {
      const msg = inline(
        fmt(t(state.strings, 'clean_bin_done_toast'), {
          size: formatSize(res.bytes),
        }),
      );
      pushLog('success', msg);
      showNotice('success', msg);
      set({ binStatus: { available: true, files: 0, bytes: 0 } });
    } else {
      showNotice('error', inline(t(state.strings, 'clean_failed_toast')));
    }
  } catch (err) {
    set({ binEmptying: false });
    showNotice('error', String(err));
  }
}

export async function runCleanScan(): Promise<void> {
  set({
    cleanScanning: true,
    cleanReport: null,
    cleanSel: new Set(),
    cleanArmed: false,
  });
  try {
    await bridge.scan_cleanup();
  } catch (err) {
    showNotice('error', String(err));
    set({ cleanScanning: false });
  }
}

export function toggleCleanLoc(id: CleanLocationId): void {
  const sel = new Set(state.cleanSel);
  if (sel.has(id)) sel.delete(id);
  else sel.add(id);
  set({ cleanSel: sel, cleanArmed: false });
}

export function setCleanAll(select: boolean): void {
  const live = (state.cleanReport?.locations ?? []).map((l) => l.id);
  set({
    cleanSel: select ? new Set(live) : new Set(),
    cleanArmed: false,
  });
}

export async function runCleanDelete(): Promise<void> {
  if (state.cleanSel.size === 0 || state.cleanDeleting) return;
  if (!state.cleanArmed) {
    set({ cleanArmed: true });
    return;
  }
  const byId = new Map(
    (state.cleanReport?.locations ?? []).map((l) => [l.id, l]),
  );
  const ids = [...state.cleanSel];
  const freedBytes = ids.reduce(
    (n, id) => n + (byId.get(id)?.bytes ?? 0),
    0,
  );
  set({ cleanDeleting: true, cleanArmed: false });
  try {
    // Delete by location id: the backend (and the mock) remove only
    // what the last scan flagged under those locations.
    const res = await bridge.delete_cleanup(ids);
    const totalDeleted = res.deleted.length;
    set({ cleanDeleting: false });
    if (totalDeleted > 0) {
      const msg = inline(
        fmt(t(state.strings, 'clean_deleted_toast'), {
          n: totalDeleted,
          freed: formatSize(freedBytes),
        }),
      );
      pushLog('success', msg);
      showNotice('success', msg);
    }
    const firstFail = res.failed[0];
    if (firstFail) {
      showNotice('error', inline(t(state.strings, 'clean_failed_toast')));
    }
    // Re-scan so the panel shows what actually remains.
    await runCleanScan();
  } catch (err) {
    showNotice('error', String(err));
    set({ cleanDeleting: false });
  }
}

// React bindings: components re-render on any store change.
export function useStore(): UIState {
  return useSyncExternalStore(subscribe, getSnapshot);
}
