/**
 * Typed JSON protocol shared by the Python core and the UI.
 *
 * Mirrors app/protocol.py (Python). Keep the two files in sync:
 * every shape defined here crosses the pywebview bridge as JSON, so a
 * change on one side must be reflected on the other.
 */

export const PROTOCOL_VERSION = 1;

// ── Event kinds pushed from AppController to the UI ─────────────
export type EventKind =
  | 'total'
  | 'item'
  | 'progress'
  | 'done'
  | 'error'
  | 'watch_item'
  | 'watch_error'
  | 'dup_progress'
  | 'dup_done'
  | 'space_progress'
  | 'space_done'
  | 'clean_progress'
  | 'clean_done';

export type DuplicateMode = 'skip' | 'rename' | 'overwrite';
export type ThemeName = 'light' | 'dark';
export type LangCode = 'en' | 'fa';

export const EVENT_KINDS: ReadonlySet<EventKind> = new Set([
  'total',
  'item',
  'progress',
  'done',
  'error',
  'watch_item',
  'watch_error',
  'dup_progress',
  'dup_done',
  'space_progress',
  'space_done',
  'clean_progress',
  'clean_done',
]);

// ── Wire shapes ─────────────────────────────────────────────────

export interface CategoryMeta {
  icon: string;
  nameEn: string;
  nameFa: string;
}

export interface AppState {
  version: string;
  categories: Record<string, string[]>;
  categoryMeta: Record<string, Partial<CategoryMeta>>;
  recentFolders: string[];
  watchedFolders: string[];
  theme: ThemeName;
  language: LangCode;
}

export interface PlanItem {
  name: string;
  category: string;
  action: 'ok' | 'skip' | 'rename' | 'overwrite';
  final_name: string;
}

export interface SortLogEntry {
  action: 'copied' | 'moved';
  source: string;
  final_dest: string;
  name: string;
  category: string;
}

export interface SortDone {
  copied: number;
  skipped: number;
  errors: number;
  target_dir: string;
  sort_log: SortLogEntry[];
}

export interface UndoDone {
  restored: number;
  removed: number;
  failed: number;
  nothing: boolean;
}

// ── Watch mode (auto-sort folders) ──────────────────────────────

export interface WatchItem {
  folder: string;
  name: string;
  category: string;
  action: 'moved' | 'skipped' | 'error';
  error?: string;
}

export interface WatchError {
  folder: string;
  message: string;
}

export interface EventMessage {
  kind: EventKind;
  payload: unknown;
}

// ── Duplicate finder (Api.find_duplicates) ───────────────────────

export interface DupProgress {
  phase: 'listing' | 'hashing';
  processed: number;
  total: number;
}

export interface DupFile {
  path: string;
  size: number;
}

export interface DupGroup {
  id: string; // short sha256 prefix
  size: number; // bytes of one copy
  files: DupFile[];
}

export interface DupDone {
  groups: DupGroup[];
  wasted_bytes: number;
  files_scanned: number;
}

export interface DupDeleteResult {
  deleted: string[];
  failed: { path: string; error: string }[];
}

// ── Disk space analysis (Api.scan_disk) ──────────────────────────

export interface SpaceCategory {
  files: number;
  bytes: number;
}

export interface SpaceTopFile {
  path: string;
  size: number;
}

export interface SpaceProgress {
  phase: 'scanning';
  processed: number;
  bytes: number;
}

export interface SpaceDone {
  by_category: Record<string, SpaceCategory>;
  top_files: SpaceTopFile[];
  files_scanned: number;
  total_bytes: number;
}

// ── Temp / cache cleanup (Api.scan_cleanup) ─────────────────────

export type CleanLocationId =
  | 'user_temp'
  | 'crash_dumps'
  | 'chrome_cache'
  | 'edge_cache'
  | 'firefox_cache'
  | 'thumbnails';

export interface CleanLocation {
  id: CleanLocationId;
  files: number;
  bytes: number;
}

export interface CleanProgress {
  phase: 'scanning';
  location: CleanLocationId;
  processed: number;
  files: number;
  bytes: number;
}

export interface CleanDone {
  locations: CleanLocation[];
  total_files: number;
  total_bytes: number;
}

export interface CleanDeleteResult {
  deleted: string[];
  failed: { path: string; error: string }[];
  freed_bytes: number;
}

// ── Analysis report (Api.analyze_folder) ────────────────────────

export interface AnalysisReport {
  total: number;
  by_category: Record<string, number>;
  large_files: [string, number][];
  old_files: [string, number][];
  unknown_extensions: string[];
  total_size: number;
  suggestions: string[];
  error?: string;
}

// ── Live event payloads (window.onSortEvent) ───────────────────

export type ItemStatus =
  | 'ok'
  | 'skip'
  | 'error'
  | 'restored'
  | 'removed'
  | 'failed';

export interface SortItemEvent {
  status: ItemStatus;
  name?: string;
  category?: string;
  action?: 'copied' | 'moved';
  error?: string;
}

// ── Fallback display metadata (used until Python state arrives) ──
// Mirrors the constants once shipped in web/js/data.js.
export const DEFAULT_CATEGORY_META: Record<string, CategoryMeta> = {
  images: { icon: '📸', nameEn: 'Images', nameFa: 'تصاویر' },
  documents: { icon: '📄', nameEn: 'Documents', nameFa: 'اسناد' },
  videos: { icon: '🎬', nameEn: 'Videos', nameFa: 'ویدئو' },
  audio: { icon: '🎵', nameEn: 'Audio', nameFa: 'صوتی' },
  archives: { icon: '📦', nameEn: 'Archives', nameFa: 'آرشیو' },
  code: { icon: '💻', nameEn: 'Code', nameFa: 'کد' },
  data: { icon: '🗃️', nameEn: 'Data', nameFa: 'داده' },
  ebooks: { icon: '📚', nameEn: 'E-Books', nameFa: 'کتاب‌ها' },
  executables: { icon: '⚙️', nameEn: 'Executables', nameFa: 'اجراپذیرها' },
  fonts: { icon: '🔤', nameEn: 'Fonts', nameFa: 'فونت‌ها' },
  others: { icon: '❓', nameEn: 'Unknown', nameFa: 'ناشناس' },
};

export function categoryName(id: string, lang: LangCode): string {
  const meta = DEFAULT_CATEGORY_META[id];
  return lang === 'fa' ? meta?.nameFa ?? id : meta?.nameEn ?? id;
}

export function categoryIcon(id: string): string {
  return DEFAULT_CATEGORY_META[id]?.icon ?? '📁';
}
