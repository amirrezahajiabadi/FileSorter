/**
 * Minimal external store + React bindings.
 *
 * The vanilla UI kept everything in one global State object with manual
 * subscribers; this is the same idea, typed, and consumed through
 * useSyncExternalStore so React components re-render on change.
 */

import { useSyncExternalStore } from 'react';

import type { AppState, CategoryMeta, LangCode, ThemeName } from './protocol';
import { DEFAULT_CATEGORY_META } from './protocol';
import { bridge, isDesktop } from './transport';
import type { StringTable } from './i18n';

export interface CategoryRow {
  id: string;
  icon: string;
  name: string;
  extensions: string[];
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
};

let state: UIState = initial;
let appState: AppState | null = null;
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
    // Localized name: persisted meta wins, then the built-in fallback.
    const name =
      (lang === 'fa'
        ? meta.nameFa ?? fallback?.nameFa
        : meta.nameEn ?? fallback?.nameEn) ?? id;
    return { id, icon, name, extensions: app.categories[id] ?? [] };
  });
}

function applyTheme(theme: ThemeName): void {
  document.documentElement.dataset.theme = theme;
}

// ── Actions ─────────────────────────────────────────────────────

export async function init(): Promise<void> {
  try {
    const app = await bridge.get_state();
    appState = app;
    const strings = await bridge.get_strings(app.language);
    applyTheme(app.theme);
    document.documentElement.lang = app.language;
    set({
      ready: true,
      theme: app.theme,
      lang: app.language,
      version: app.version,
      strings,
      recentFolders: app.recentFolders ?? [],
      categories: buildRows(app, app.language),
    });
  } catch (err) {
    console.error('init failed:', err);
    set({ ready: true });
  }
}

export async function browseFolder(): Promise<void> {
  const path = await bridge.browse_folder();
  if (path) {
    set({ folder: path });
  }
}

export function pickRecent(path: string): void {
  set({ folder: path });
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

// React bindings: components re-render on any store change.
export function useStore(): UIState {
  return useSyncExternalStore(subscribe, getSnapshot);
}
