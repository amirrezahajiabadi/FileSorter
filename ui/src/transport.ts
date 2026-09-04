/**
 * Transport layer: the single door between React and the Python core.
 *
 * In the packaged app this is the pywebview JS bridge (window.pywebview.api).
 * In a headless service (app/service.py) the HTTP transport stands in —
 * JSON-RPC over POST /api + Server-Sent Events, same vocabulary.
 * In a plain browser with no backend (vite dev) a deterministic mock
 * stands in, so the entire flow is explorable without the desktop runtime:
 * a sample folder + report are used, and sort/undo events are simulated.
 * The mock data is clearly surfaced in the UI (dev banner, sample badge),
 * and destructive/sorting actions only ever run against the sample data.
 *
 * Method names deliberately mirror Api methods in app/api.py — the two
 * sides of the protocol share one vocabulary.
 */

import type {
  AnalysisReport,
  AppState,
  CategoryMeta,
  CleanDeleteResult,
  CleanDone,
  DuplicateMode,
  DupDeleteResult,
  DupDone,
  DupFile,
  DriveInfo,
  DupGroup,
  EventKind,
  LangCode,
  PlanItem,
  SortDone,
  SortItemEvent,
  SmartRule,
  SpaceDone,
  ThemeName,
  UndoDone,
  WatchError,
  WatchItem,
} from './protocol';
import { STRINGS_MIRROR } from './generated/strings';
import { emit, isDesktop } from './events';
import { createHttpBridge, isHttpConfigured } from './http';

// ── pywebview bridge typing ─────────────────────────────────────

export interface BridgeApi {
  get_state(): Promise<AppState>;
  browse_folder(): Promise<string | null>;
  toggle_theme(): Promise<ThemeName>;
  toggle_language(): Promise<LangCode>;
  get_strings(lang: LangCode): Promise<Record<string, string>>;
  analyze_folder(path: string): Promise<AnalysisReport>;
  plan_sort(path: string, duplicate_mode?: DuplicateMode): Promise<PlanItem[]>;
  start_sort(
    path: string,
    move?: boolean,
    duplicate_mode?: DuplicateMode,
  ): Promise<boolean>;
  undo_sort(): Promise<boolean>;
  find_duplicates(path: string): Promise<boolean>;
  delete_duplicates(paths: string[]): Promise<DupDeleteResult>;
  list_drives(): Promise<DriveInfo[]>;
  scan_disk(path: string): Promise<boolean>;
  cancel_scan(): Promise<boolean>;
  scan_cleanup(): Promise<boolean>;
  delete_cleanup(paths: string[]): Promise<CleanDeleteResult>;
  add_watch_folder(path: string): Promise<boolean>;
  remove_watch_folder(path: string): Promise<boolean>;
  start_watch(): Promise<boolean>;
  stop_watch(): Promise<boolean>;
  save_categories(
    categories: Record<string, string[]>,
    meta?: Record<string, unknown>,
  ): Promise<boolean>;
  save_smart_rules(rules: SmartRule[]): Promise<boolean>;
  restore_defaults(): Promise<Record<string, string[]>>;
}

declare global {
  interface Window {
    pywebview?: { api?: BridgeApi };
    onSortEvent?: (message: { kind: EventKind; payload: unknown }) => void;
  }
}

// ── Transport selection ─────────────────────────────────────────
//
// 1. Desktop (pywebview window)   -> native bridge
// 2. Headless service reachable   -> HTTP transport (JSON-RPC + SSE)
// 3. Plain browser, no backend    -> deterministic mock (dev preview)

export type TransportKind = 'desktop' | 'service' | 'mock';

export const transportKind: TransportKind = isDesktop()
  ? 'desktop'
  : isHttpConfigured()
    ? 'service'
    : 'mock';

export const bridge: BridgeApi = isDesktop()
  ? (window.pywebview!.api as BridgeApi)
  : isHttpConfigured()
    ? createHttpBridge()
    : createMockBridge();

export { isDesktop, subscribeEvents } from './events';
export type { SortEvent } from './events';

// ── Browser-only mock (dev preview, no Python attached) ─────────

const SAMPLE_PATH = 'D:/Sample Folder';

const SAMPLE_DEFAULT_CATEGORIES: Record<string, string[]> = {
  images: ['.jpg', '.png', '.gif', '.webp', '.svg'],
  documents: ['.pdf', '.docx', '.txt', '.xlsx'],
  videos: ['.mp4', '.mkv'],
  audio: ['.mp3', '.wav'],
  archives: ['.zip', '.rar'],
  code: ['.py', '.ts', '.js', '.html'],
  data: ['.json', '.csv'],
  ebooks: ['.epub'],
  executables: ['.exe'],
  fonts: ['.ttf'],
  others: [],
};

const SAMPLE_STATE: AppState = {
  version: '5.8.0',
  categories: SAMPLE_DEFAULT_CATEGORIES,
  categoryMeta: {},
  smartRules: [],
  recentFolders: [],
  watchedFolders: [],
  theme: 'dark',
  language: 'en',
};

const SAMPLE_REPORT: AnalysisReport = {
  total: 34,
  total_size: 842_200_000,
  by_category: {
    images: 12,
    documents: 7,
    videos: 3,
    audio: 4,
    archives: 2,
    code: 5,
    data: 1,
    ebooks: 0,
    executables: 0,
    fonts: 0,
    others: 0,
  },
  large_files: [
    ['holiday-2023.mp4', 412_000_000],
    ['backup.zip', 158_300_000],
  ],
  old_files: [
    ['scan-2019.pdf', 590],
    ['notes-old.txt', 402],
  ],
  unknown_extensions: ['.part', '.tmp'],
  suggestions: [],
};

const SAMPLE_PLAN: PlanItem[] = [
  { name: 'holiday-2023.mp4', category: 'videos', action: 'ok', final_name: 'holiday-2023.mp4' },
  { name: 'IMG_1042.jpg', category: 'images', action: 'ok', final_name: 'IMG_1042.jpg' },
  { name: 'report-final.pdf', category: 'documents', action: 'rename', final_name: 'report-final (1).pdf' },
  { name: 'backup.zip', category: 'archives', action: 'ok', final_name: 'backup.zip' },
  { name: 'logo.svg', category: 'images', action: 'ok', final_name: 'logo.svg' },
  { name: 'dupe.png', category: 'images', action: 'skip', final_name: 'dupe.png' },
  { name: 'song.mp3', category: 'audio', action: 'ok', final_name: 'song.mp3' },
  { name: 'main.ts', category: 'code', action: 'ok', final_name: 'main.ts' },
  { name: '2022-tax.pdf', category: 'documents', action: 'overwrite', final_name: '2022-tax.pdf' },
  { name: 'invoice-2024.pdf', category: 'documents', action: 'ok', final_name: 'invoice-2024.pdf' },
  { name: 'فاکتور-1403.pdf', category: 'documents', action: 'ok', final_name: 'فاکتور-1403.pdf' },
  { name: 'menu.pdf', category: 'documents', action: 'ok', final_name: 'menu.pdf' },
];

function dupFiles(specs: [string, number][]): DupFile[] {
  return specs.map(([rel, size]) => ({
    path: `${SAMPLE_PATH}/${rel}`,
    size,
  }));
}

function makeSampleDupGroups(): DupGroup[] {
  return [
    {
      id: '3f9a1c2b7d4e',
      size: 158_300_000,
      files: dupFiles([
        ['backup/backup.zip', 158_300_000],
        ['archives/backup-copy.zip', 158_300_000],
      ]),
    },
    {
      id: '8d2e0f1a5b9c',
      size: 8_200_000,
      files: dupFiles([
        ['music/song.mp3', 8_200_000],
        ['music/song (1).mp3', 8_200_000],
        ['downloads/song-copy.mp3', 8_200_000],
      ]),
    },
    {
      id: '1a7c4e9f2b3d',
      size: 3_400_000,
      files: dupFiles([
        ['photos/holiday-2023.jpg', 3_400_000],
        ['backup/old/holiday-2023.jpg', 3_400_000],
      ]),
    },
    {
      id: '6e0b2d8a4f1c',
      size: 1_200_000,
      files: dupFiles([
        ['docs/report-final.pdf', 1_200_000],
        ['inbox/report (2).pdf', 1_200_000],
      ]),
    },
  ];
}

function dupSummary(groups: DupGroup[]): { groups: DupGroup[]; wasted: number } {
  const live = groups
    .map((g) => ({ ...g, files: [...g.files] }))
    .filter((g) => g.files.length >= 2);
  const wasted = live.reduce(
    (sum, g) => sum + g.size * (g.files.length - 1),
    0,
  );
  return { groups: live, wasted };
}

function stemTokens(name: string): Set<string> {
  // Whole-word tokens of the stem (no extension); unicode letters/digits
  // count as word chars so Persian filenames split the same as English.
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const parts = stem
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
  return new Set(parts);
}

function matchRuleCategory(name: string, categories: Record<string, string[]>, rules: SmartRule[]): string | null {
  if (!rules || rules.length === 0) return null;
  const tokens = stemTokens(name);
  if (tokens.size === 0) return null;
  for (const rule of rules) {
    const cat = rule?.category ?? '';
    if (!(cat in categories)) continue; // inactive rule — category was deleted
    for (const kw of rule?.keywords ?? []) {
      if (kw && tokens.has(kw.toLowerCase())) return cat;
    }
  }
  return null;
}

function applyRulesToPlan(plan: PlanItem[]): PlanItem[] {
  return plan.map((item) => {
    const cat = matchRuleCategory(item.name, SAMPLE_STATE.categories, SAMPLE_STATE.smartRules);
    return cat ? { ...item, category: cat } : item;
  });
}

function makeItems(): SortItemEvent[] {
  return applyRulesToPlan(SAMPLE_PLAN).map((p) => {
    if (p.action === 'skip') {
      return { status: 'skip', name: p.name, category: p.category };
    }
    if (p.name === 'menu.pdf') {
      // One file fails mid-copy so the counters and log stay consistent
      // with the completed payload below.
      return {
        status: 'error',
        name: p.name,
        category: p.category,
        error: 'permission denied',
      };
    }
    return {
      status: 'ok',
      name: p.final_name,
      category: p.category,
      action: 'copied',
    };
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function simulateStream(items: SortItemEvent[]): Promise<void> {
  emit('total', items.length);
  for (let i = 0; i < items.length; i++) {
    await sleep(90);
    emit('item', items[i]);
    emit('progress', i + 1);
  }
}

function createMockBridge(): BridgeApi {
  return {
    async get_state(): Promise<AppState> {
      return SAMPLE_STATE;
    },
    async browse_folder(): Promise<string | null> {
      return SAMPLE_PATH;
    },
    async toggle_theme(): Promise<ThemeName> {
      SAMPLE_STATE.theme = SAMPLE_STATE.theme === 'dark' ? 'light' : 'dark';
      return SAMPLE_STATE.theme;
    },
    async toggle_language(): Promise<LangCode> {
      SAMPLE_STATE.language = SAMPLE_STATE.language === 'en' ? 'fa' : 'en';
      return SAMPLE_STATE.language;
    },
    async get_strings(lang: LangCode): Promise<Record<string, string>> {
      return STRINGS_MIRROR[lang];
    },
    async analyze_folder(_path: string): Promise<AnalysisReport> {
      await sleep(250); // feel of a real scan
      return SAMPLE_REPORT;
    },
    async plan_sort(_path: string, _mode?: DuplicateMode): Promise<PlanItem[]> {
      return applyRulesToPlan(SAMPLE_PLAN);
    },
    async start_sort(): Promise<boolean> {
      void simulateStream(makeItems()).then(() => {
        const okItems = makeItems().filter((i) => i.status === 'ok');
        const sort_log: SortDone['sort_log'] = okItems.map((i) => ({
          action: 'copied',
          source: `D:/Sample Folder/${i.name}`,
          final_dest: `D:/Sample Folder/sorted/${i.category}/${i.name}`,
          name: i.name ?? '?',
          category: i.category ?? 'others',
        }));
        const payload: SortDone = {
          copied: 10,
          skipped: 1,
          errors: 1,
          target_dir: 'D:/Sample Folder/sorted',
          sort_log,
        };
        emit('done', payload);
      });
      return true;
    },
    async find_duplicates(): Promise<boolean> {
      // Simulate a live scan over the current sample duplicates: list,
      // then hash each candidate with progress ticks, then report.
      // cancel_scan() flips the flag; the loop stops and reports a
      // dup_done marked cancelled, like the real backend.
      const { groups } = dupSummary(dupState);
      const fileCount = groups.reduce((n, g) => n + g.files.length, 0);
      mockScanRunning = true;
      mockScanCancel = false;
      await sleep(120);
      if (mockScanCancel) {
        mockScanRunning = false;
        emit('dup_done', { groups: [], wasted_bytes: 0, files_scanned: 0, cancelled: true });
        return true;
      }
      emit('dup_progress', { phase: 'listing', processed: 0, total: fileCount });
      await sleep(150);
      if (mockScanCancel) {
        mockScanRunning = false;
        emit('dup_done', { groups: [], wasted_bytes: 0, files_scanned: 0, cancelled: true });
        return true;
      }
      for (let i = 0; i < fileCount; i++) {
        await sleep(70);
        if (mockScanCancel) break;
        emit('dup_progress', {
          phase: 'hashing',
          processed: i + 1,
          total: fileCount,
        });
      }
      mockScanRunning = false;
      const done = dupSummary(dupState);
      const payload: DupDone = mockScanCancel
        ? { groups: [], wasted_bytes: 0, files_scanned: 34, cancelled: true }
        : { groups: done.groups, wasted_bytes: done.wasted, files_scanned: 34 };
      emit('dup_done', payload);
      return true;
    },
    async delete_duplicates(paths: string[]): Promise<DupDeleteResult> {
      await sleep(250); // feel of real deletions
      const deleted: string[] = [];
      const failed: { path: string; error: string }[] = [];
      for (const path of paths) {
        const found = dupState.some((g) => g.files.some((f) => f.path === path));
        if (found) {
          dupState = dupState.map((g) => ({
            ...g,
            files: g.files.filter((f) => f.path !== path),
          }));
          deleted.push(path);
        } else {
          failed.push({ path, error: 'no longer exists' });
        }
      }
      return { deleted, failed };
    },
    async list_drives(): Promise<DriveInfo[]> {
      const GB = 1024 * 1024 * 1024;
      return [
        { letter: 'C', path: 'C:\\', total: 512 * GB, free: 96 * GB },
        { letter: 'D', path: 'D:\\', total: 1024 * GB, free: 318 * GB },
      ];
    },
    async cancel_scan(): Promise<boolean> {
      const wasRunning = mockScanRunning;
      mockScanCancel = true;
      return wasRunning;
    },
    async scan_disk(): Promise<boolean> {
      // Simulate a live disk scan: stream counters, then report a
      // deterministic sample breakdown (bytes kept consistent between
      // category totals, the total, and the largest files).
      // cancel_scan() flips the flag; the loop stops and reports a
      // partial space_done marked cancelled, like the real backend.
      const MB = 1024 * 1024;
      const SAMPLE_SPACE: SpaceDone = {
        by_category: {
          videos: { files: 4, bytes: 1280 * MB },
          images: { files: 12, bytes: 348 * MB },
          archives: { files: 9, bytes: 380 * MB },
          documents: { files: 86, bytes: 41 * MB },
          others: { files: 23, bytes: 18 * MB },
        },
        top_files: [
          { path: 'D:/Sample Folder/videos/holiday-2023.mp4', size: 890 * MB },
          { path: 'D:/Sample Folder/videos/screen-rec-12.mp4', size: 390 * MB },
          { path: 'D:/Sample Folder/archives/backup-2024.zip', size: 380 * MB },
          { path: 'D:/Sample Folder/images/wallpaper-4k.png', size: 212 * MB },
          { path: 'D:/Sample Folder/documents/annual-report.pdf', size: 24 * MB },
          { path: 'D:/Sample Folder/others/disk-image.img', size: 18 * MB },
        ],
        files_scanned: 134,
        total_bytes: 2067 * MB,
      };
      mockScanRunning = true;
      mockScanCancel = false;
      const steps = 6;
      let stoppedAt = 0;
      for (let i = 1; i <= steps; i++) {
        await sleep(140);
        if (mockScanCancel) {
          stoppedAt = i;
          break;
        }
        const frac = i / steps;
        emit('space_progress', {
          phase: 'scanning',
          processed: Math.round(SAMPLE_SPACE.files_scanned * frac),
          bytes: Math.round(SAMPLE_SPACE.total_bytes * frac),
        });
      }
      mockScanRunning = false;
      if (stoppedAt > 0) {
        const frac = stoppedAt / steps;
        emit('space_done', {
          ...SAMPLE_SPACE,
          files_scanned: Math.round(SAMPLE_SPACE.files_scanned * frac),
          total_bytes: Math.round(SAMPLE_SPACE.total_bytes * frac),
          cancelled: true,
        });
      } else {
        emit('space_done', SAMPLE_SPACE);
      }
      return true;
    },
    async scan_cleanup(): Promise<boolean> {
      // Simulate a live junk scan: per-location ticks, then the report.
      const totals = cleanTotals();
      const steps = Math.max(totals.locations.length, 1);
      for (let i = 0; i < steps; i++) {
        await sleep(160);
        const loc = totals.locations[i];
        if (!loc) break;
        emit('clean_progress', {
          phase: 'scanning',
          location: loc.id,
          processed: loc.files,
          files: loc.files,
          bytes: loc.bytes,
        });
      }
      const done: CleanDone = cleanTotals();
      emit('clean_done', done);
      return true;
    },
    async delete_cleanup(ids: string[]): Promise<CleanDeleteResult> {
      await sleep(300); // feel of real deletions
      const deleted: string[] = [];
      const failed: { path: string; error: string }[] = [];
      let freedBytes = 0;
      for (const id of ids) {
        const list = junkState[id] ?? [];
        for (const f of [...list]) {
          // One thumbnail file stays locked to demonstrate the honest
          // failure path (desktop: a file in use by Explorer).
          if (id === 'thumbnails' && f.name === 'thumbcache_256.db') {
            failed.push({ path: `${id}/${f.name}`, error: 'file is in use' });
            continue;
          }
          freedBytes += f.bytes;
          deleted.push(`${id}/${f.name}`);
        }
        junkState[id] = id === 'thumbnails'
          ? (junkState[id] ?? []).filter((f) => f.name !== 'thumbcache_256.db')
          : [];
      }
      return { deleted, failed, freed_bytes: freedBytes };
    },
    async undo_sort(): Promise<boolean> {
      const items: SortItemEvent[] = [
        { status: 'removed', name: 'menu.pdf' },
        { status: 'restored', name: 'holiday-2023.mp4' },
      ];
      void simulateStream(items).then(() => {
        const payload: UndoDone = {
          restored: 1,
          removed: 1,
          failed: 0,
          nothing: false,
        };
        emit('done', payload);
      });
      return true;
    },
    async save_categories(
      categories: Record<string, string[]>,
      meta?: Record<string, unknown>,
    ): Promise<boolean> {
      SAMPLE_STATE.categories = categories;
      SAMPLE_STATE.categoryMeta = (meta ?? {}) as Record<string, CategoryMeta>;
      return true;
    },
    async save_smart_rules(rules: SmartRule[]): Promise<boolean> {
      SAMPLE_STATE.smartRules = rules.map((r) => ({
        keywords: [...r.keywords],
        category: r.category,
      }));
      return true;
    },
    async restore_defaults(): Promise<Record<string, string[]>> {
      SAMPLE_STATE.categories = { ...SAMPLE_DEFAULT_CATEGORIES };
      SAMPLE_STATE.categoryMeta = {};
      SAMPLE_STATE.smartRules = [];
      return SAMPLE_STATE.categories;
    },

    // Watch mode: folder list is real state; the sample events simulate
    // a folder receiving files after start_watch().
    async add_watch_folder(path: string): Promise<boolean> {
      if (!SAMPLE_STATE.watchedFolders.includes(path)) {
        SAMPLE_STATE.watchedFolders.push(path);
      }
      return true;
    },
    async remove_watch_folder(path: string): Promise<boolean> {
      SAMPLE_STATE.watchedFolders = SAMPLE_STATE.watchedFolders.filter(
        (f) => f !== path,
      );
      return true;
    },
    async start_watch(): Promise<boolean> {
      stopMockWatch();
      if (SAMPLE_STATE.watchedFolders.length === 0) return true;
      const folder = SAMPLE_STATE.watchedFolders[0];
      const seq: WatchItem[] = [
        { folder, name: 'IMG_2041.jpg', category: 'images', action: 'moved' },
        { folder, name: 'voice-note.mp3', category: 'audio', action: 'moved' },
        { folder, name: 'report.pdf', category: 'documents', action: 'moved' },
        { folder, name: 'backup.zip', category: 'archives', action: 'moved' },
        { folder, name: 'dupe.jpg', category: 'images', action: 'skipped' },
        { folder, name: 'locked.xlsx', category: 'documents', action: 'error', error: 'file is locked' },
      ];
      let i = 0;
      mockTimer = setInterval(() => {
        if (i >= seq.length) {
          stopMockWatch();
          return;
        }
        const item = seq[i++];
        emit('watch_item', item);
        if (item.action === 'error') {
          const err: WatchError = { folder, message: item.error ?? '' };
          // Not emitted: errors are per-file; keep the demo log clean.
          void err;
        }
      }, 900);
      return true;
    },
    async stop_watch(): Promise<boolean> {
      stopMockWatch();
      return true;
    },
  };
}

let mockTimer: ReturnType<typeof setInterval> | null = null;

// Cancel support for the mock disk/dup scans (mirrors the real backend).
let mockScanRunning = false;
let mockScanCancel = false;
let dupState: DupGroup[] = makeSampleDupGroups();

// Mutable mock junk locations: id -> { size-bytes per fake file name }.
// delete_cleanup removes entries so a rescan shows honest "emptied"
// state, exactly like the desktop runtime behaves.
type CleanMockFile = { name: string; bytes: number };
const CLEAN_LOC_IDS = [
  'user_temp',
  'crash_dumps',
  'chrome_cache',
  'edge_cache',
  'firefox_cache',
  'thumbnails',
] as const;

function makeSampleJunk(): Record<string, CleanMockFile[]> {
  const MB = 1024 * 1024;
  return {
    user_temp: [
      { name: 'tmp-7f2a1c.tmp', bytes: 34 * MB },
      { name: 'installer-cache-9d3e.log', bytes: 12 * MB },
      { name: 'session-archive-4b88.zip', bytes: 210 * MB },
    ],
    crash_dumps: [
      { name: 'firefox.exe.8841.dmp', bytes: 48 * MB },
      { name: 'explorer.exe.1202.dmp', bytes: 72 * MB },
    ],
    chrome_cache: [
      { name: 'f_0001a2', bytes: 8 * MB },
      { name: 'f_0001b7', bytes: 22 * MB },
      { name: 'f_000201', bytes: 5 * MB },
      { name: 'data_0', bytes: 1 * MB },
    ],
    edge_cache: [
      { name: 'f_00004c', bytes: 14 * MB },
      { name: 'f_00009a', bytes: 3 * MB },
    ],
    firefox_cache: [
      { name: 'cache2-entry-01', bytes: 9 * MB },
      { name: 'cache2-entry-02', bytes: 17 * MB },
    ],
    thumbnails: [
      { name: 'thumbcache_256.db', bytes: 6 * MB },
      { name: 'thumbcache_1024.db', bytes: 38 * MB },
    ],
  };
}

let junkState: Record<string, CleanMockFile[]> = makeSampleJunk();

function cleanTotals(): { locations: CleanDone['locations']; total_files: number; total_bytes: number } {
  const locations = CLEAN_LOC_IDS.map((id) => ({
    id,
    files: junkState[id]?.length ?? 0,
    bytes: (junkState[id] ?? []).reduce((sum, f) => sum + f.bytes, 0),
  }))
    .filter((l) => l.files > 0 || l.bytes > 0)
    .sort((a, b) => b.bytes - a.bytes);
  const total_files = locations.reduce((n, l) => n + l.files, 0);
  const total_bytes = locations.reduce((n, l) => n + l.bytes, 0);
  return { locations, total_files, total_bytes };
}


function stopMockWatch(): void {
  if (mockTimer !== null) {
    clearInterval(mockTimer);
    mockTimer = null;
  }
}
