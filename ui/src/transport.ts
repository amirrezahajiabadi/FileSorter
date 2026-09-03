/**
 * Transport layer: the single door between React and the Python core.
 *
 * In the packaged app this is the pywebview JS bridge (window.pywebview.api).
 * In a plain browser (vite dev, no Python attached) a deterministic mock
 * stands in, so the entire flow is explorable without the desktop runtime:
 * a sample folder + report are used, and sort/undo events are simulated.
 * The mock data is clearly surfaced in the UI (dev banner, sample badge),
 * and destructive/sorting actions only ever run against the sample data.
 *
 * Method names deliberately mirror Api methods in main_web.py — the two
 * sides of the protocol share one vocabulary.
 */

import type {
  AnalysisReport,
  AppState,
  CategoryMeta,
  DuplicateMode,
  EventKind,
  LangCode,
  PlanItem,
  SortDone,
  SortItemEvent,
  ThemeName,
  UndoDone,
  WatchError,
  WatchItem,
} from './protocol';
import { STRINGS_MIRROR } from './generated/strings';

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
  add_watch_folder(path: string): Promise<boolean>;
  remove_watch_folder(path: string): Promise<boolean>;
  start_watch(): Promise<boolean>;
  stop_watch(): Promise<boolean>;
  save_categories(
    categories: Record<string, string[]>,
    meta?: Record<string, unknown>,
  ): Promise<boolean>;
  restore_defaults(): Promise<Record<string, string[]>>;
}

declare global {
  interface Window {
    pywebview?: { api?: BridgeApi };
    onSortEvent?: (message: { kind: EventKind; payload: unknown }) => void;
  }
}

export type SortEvent = { kind: EventKind; payload: unknown };

// ── Detection ───────────────────────────────────────────────────

export function isDesktop(): boolean {
  return typeof window !== 'undefined' && !!window.pywebview?.api;
}

export const bridge: BridgeApi = isDesktop()
  ? (window.pywebview!.api as BridgeApi)
  : createMockBridge();

// One listener registry shared by both transports: desktop pushes events
// through window.onSortEvent, the mock emits on a timer.
const listeners = new Set<(msg: SortEvent) => void>();

export function subscribeEvents(cb: (msg: SortEvent) => void): () => void {
  listeners.add(cb);
  if (isDesktop()) {
    window.onSortEvent = cb;
  }
  return () => {
    listeners.delete(cb);
    if (isDesktop() && window.onSortEvent === cb) {
      window.onSortEvent = undefined;
    }
  };
}

function emit(kind: EventKind, payload: unknown): void {
  const msg: SortEvent = { kind, payload };
  listeners.forEach((cb) => cb(msg));
}

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
  version: '5.1.0',
  categories: SAMPLE_DEFAULT_CATEGORIES,
  categoryMeta: {},
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
  { name: 'menu.pdf', category: 'documents', action: 'ok', final_name: 'menu.pdf' },
];

function makeItems(): SortItemEvent[] {
  return SAMPLE_PLAN.map((p) => {
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
      return SAMPLE_PLAN;
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
          copied: 8,
          skipped: 1,
          errors: 1,
          target_dir: 'D:/Sample Folder/sorted',
          sort_log,
        };
        emit('done', payload);
      });
      return true;
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
    async restore_defaults(): Promise<Record<string, string[]>> {
      SAMPLE_STATE.categories = { ...SAMPLE_DEFAULT_CATEGORIES };
      SAMPLE_STATE.categoryMeta = {};
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

function stopMockWatch(): void {
  if (mockTimer !== null) {
    clearInterval(mockTimer);
    mockTimer = null;
  }
}
