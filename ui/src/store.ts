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
  DuplicateMode,
  LangCode,
  PlanItem,
  SortDone,
  SortItemEvent,
  ThemeName,
  UndoDone,
  WatchError,
  WatchItem,
} from './protocol';
import { DEFAULT_CATEGORY_META } from './protocol';
import { bridge, isDesktop, subscribeEvents } from './transport';
import type { SortEvent } from './transport';
import type { StringTable } from './i18n';
import { fmt, inline, t } from './i18n';

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

export interface WatchRow {
  path: string;
  moved: number;
  skipped: number;
  failed: number;
}

export interface UIState {
  ready: boolean;
  desktop: boolean;
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
  notice: Notice | null;
}

const initial: UIState = {
  ready: false,
  desktop: isDesktop(),
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
  notice: null,
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

function pushLog(kind: LogKind, text: string): void {
  logId += 1;
  set({ logs: [...state.logs, { id: logId, kind, text }] });
}

function showNotice(kind: Notice['kind'], text: string): void {
  set({ notice: { kind, text } });
}

function bumpCategory(id: string, delta: number): void {
  set({
    categories: state.categories.map((c) =>
      c.id === id ? { ...c, count: Math.max(0, c.count + delta) } : c,
    ),
  });
}

function mergeWatchRows(paths: string[], prev: WatchRow[]): WatchRow[] {
  return paths.map((path) => {
    const old = prev.find((r) => r.path === path);
    return old ?? { path, moved: 0, skipped: 0, failed: 0 };
  });
}

function bumpWatch(path: string, field: keyof Omit<WatchRow, 'path'>): void {
  set({
    watchFolders: state.watchFolders.map((r) =>
      r.path === path ? { ...r, [field]: r[field] + 1 } : r,
    ),
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
      pushLog(
        item.status === 'ok' || item.status === 'restored'
          ? 'success'
          : item.status === 'skip' || item.status === 'removed'
            ? 'warning'
            : 'error',
        localizeItem(item),
      );
      if (item.status === 'ok' && item.category) {
        bumpCategory(item.category, 1);
        set({ okCount: state.okCount + 1 });
      } else if (item.status === 'skip') {
        set({ skipCount: state.skipCount + 1 });
      } else if (item.status === 'error') {
        set({ errorCount: state.errorCount + 1 });
      }
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
      if (item.action === 'moved') {
        pushWatchLog(
          'success',
          inline(fmt(t(S, 'watch_sorted_log'), { name: item.name, category })),
        );
        bumpWatch(item.folder, 'moved');
      } else if (item.action === 'skipped') {
        pushWatchLog(
          'warning',
          inline(fmt(t(S, 'watch_skipped_log'), { name: item.name })),
        );
        bumpWatch(item.folder, 'skipped');
      } else {
        pushWatchLog(
          'error',
          inline(
            fmt(t(S, 'watch_error_log'), { name: item.name, error: item.error ?? '' }),
          ),
        );
        bumpWatch(item.folder, 'failed');
      }
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
    case 'error': {
      const message = String(payload);
      pushLog('error', inline(fmt(t(state.strings, 'fatal_error_log'), { error: message })));
      showNotice('error', message);
      set({ phase: 'idle', result: null });
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

export async function browseFolder(): Promise<void> {
  const path = await bridge.browse_folder();
  if (path) {
    setFolder(path);
    pushLog('info', inline(fmt(t(state.strings, 'folder_selected_log'), { path })));
  }
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

export async function saveSettings(drafts: CategoryDraft[]): Promise<boolean> {
  const categories: Record<string, string[]> = {};
  const meta: Record<string, Partial<CategoryMeta>> = {};
  for (const d of drafts) {
    categories[d.id] = d.extensions;
    meta[d.id] = { icon: d.icon, nameEn: d.nameEn, nameFa: d.nameFa };
  }
  try {
    await bridge.save_categories(categories, meta);
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

// React bindings: components re-render on any store change.
export function useStore(): UIState {
  return useSyncExternalStore(subscribe, getSnapshot);
}
