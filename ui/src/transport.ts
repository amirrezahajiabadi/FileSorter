/**
 * Transport layer: the single door between React and the Python core.
 *
 * In the packaged app this is the pywebview JS bridge (window.pywebview.api).
 * In a plain browser (vite dev, no Python attached) a local mock stands in,
 * so the UI is fully explorable without the desktop runtime.
 *
 * Method names deliberately mirror Api methods in main_web.py — the two
 * sides of the protocol share one vocabulary.
 */

import type {
  AppState,
  DuplicateMode,
  EventKind,
  LangCode,
  PlanItem,
  ThemeName,
} from './protocol';

// ── pywebview bridge typing ─────────────────────────────────────

export interface BridgeApi {
  get_state(): Promise<AppState>;
  browse_folder(): Promise<string | null>;
  toggle_theme(): Promise<ThemeName>;
  toggle_language(): Promise<LangCode>;
  get_strings(lang: LangCode): Promise<Record<string, string>>;
  analyze_folder(path: string): Promise<Record<string, unknown>>;
  plan_sort(path: string, duplicate_mode?: DuplicateMode): Promise<PlanItem[]>;
  start_sort(
    path: string,
    move?: boolean,
    duplicate_mode?: DuplicateMode,
  ): Promise<boolean>;
  undo_sort(): Promise<boolean>;
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

// ── Detection ───────────────────────────────────────────────────

export function isDesktop(): boolean {
  return typeof window !== 'undefined' && !!window.pywebview?.api;
}

export const bridge: BridgeApi = isDesktop()
  ? (window.pywebview!.api as BridgeApi)
  : createMockBridge();

/**
 * Subscribe to backend-pushed events (sort/undo progress). No-op in the
 * browser mock — events only exist in the desktop runtime.
 */
export function subscribeEvents(
  cb: (message: { kind: EventKind; payload: unknown }) => void,
): () => void {
  if (!isDesktop()) {
    return () => {};
  }
  window.onSortEvent = cb;
  return () => {
    window.onSortEvent = undefined;
  };
}

// ── Browser-only mock (dev preview, no Python attached) ─────────

const DEV_STATE: AppState = {
  version: '4.2.0',
  categories: {
    images: ['.jpg', '.png', '.gif'],
    documents: ['.pdf', '.docx'],
    videos: ['.mp4'],
    audio: ['.mp3'],
    archives: ['.zip'],
    code: ['.py', '.ts'],
    data: ['.json'],
    ebooks: ['.epub'],
    executables: ['.exe'],
    fonts: ['.ttf'],
    others: [],
  },
  categoryMeta: {},
  recentFolders: [],
  theme: 'dark',
  language: 'en',
};

const MOCK_STRINGS: Record<LangCode, Record<string, string>> = {
  en: {
    app_title: 'File Sorter',
    header_subtitle: 'Select a folder to sort its contents into categories',
    browse_btn: 'Browse',
    no_folder: 'No folder selected',
    selected_folder_label: 'Selected folder',
    categories_label: 'Categories',
    recent_folders_empty: 'No recent folders yet',
  },
  fa: {
    app_title: 'مرتب‌ساز فایل',
    header_subtitle: 'یک پوشه انتخاب کنید تا فایل‌هایش دسته‌بندی شوند',
    browse_btn: 'انتخاب پوشه',
    no_folder: 'پوشه‌ای انتخاب نشده',
    selected_folder_label: 'پوشه انتخاب‌شده',
    categories_label: 'دسته‌بندی‌ها',
    recent_folders_empty: 'هنوز پوشه‌ی اخیری نیست',
  },
};

function createMockBridge(): BridgeApi {
  return {
    async get_state(): Promise<AppState> {
      return DEV_STATE;
    },
    async browse_folder(): Promise<string | null> {
      // Browsers cannot expose real folder paths; the desktop runtime
      // (pywebview native dialog) is the only real source.
      return null;
    },
    async toggle_theme(): Promise<ThemeName> {
      DEV_STATE.theme = DEV_STATE.theme === 'dark' ? 'light' : 'dark';
      return DEV_STATE.theme;
    },
    async toggle_language(): Promise<LangCode> {
      DEV_STATE.language = DEV_STATE.language === 'en' ? 'fa' : 'en';
      return DEV_STATE.language;
    },
    async get_strings(lang: LangCode): Promise<Record<string, string>> {
      return MOCK_STRINGS[lang];
    },
    async analyze_folder(): Promise<Record<string, unknown>> {
      throw new Error('analysis requires the desktop runtime');
    },
    async plan_sort(): Promise<PlanItem[]> {
      throw new Error('planning requires the desktop runtime');
    },
    async start_sort(): Promise<boolean> {
      throw new Error('sorting requires the desktop runtime');
    },
    async undo_sort(): Promise<boolean> {
      throw new Error('undo requires the desktop runtime');
    },
    async save_categories(): Promise<boolean> {
      throw new Error('settings require the desktop runtime');
    },
    async restore_defaults(): Promise<Record<string, string[]>> {
      return DEV_STATE.categories;
    },
  };
}
