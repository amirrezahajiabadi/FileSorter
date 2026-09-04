/**
 * HTTP transport — talks to the headless local service (app/service.py)
 * instead of pywebview or the mock.
 *
 * - POST /api  : JSON-RPC — {"method", "params"} -> {"result" | "error"}
 * - GET /events: Server-Sent Events -> emit() into the shared registry
 *
 * Activated when the page is served by the service itself (its api-token
 * meta tag is present, same-origin fetch) or when VITE_API_URL points at
 * one (vite dev against a running service). The token comes from the
 * injected meta tag or VITE_API_TOKEN.
 */

import { emit } from './events';
import type {
  AnalysisReport,
  AppState,
  CleanDeleteResult,
  DupDeleteResult,
  LangCode,
  PlanItem,
  ThemeName,
} from './protocol';
import type { BridgeApi } from './transport';

const API_URL: string = (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '');

function apiToken(): string | null {
  const meta = document.querySelector<HTMLMetaElement>('meta[name="api-token"]');
  if (meta?.content) return meta.content;
  return import.meta.env.VITE_API_TOKEN ?? null;
}

/** True when the page should use the HTTP transport over the mock. */
export function isHttpConfigured(): boolean {
  return API_URL !== '' || apiToken() !== null;
}

async function call<T>(method: string, ...params: unknown[]): Promise<T> {
  const token = apiToken();
  const res = await fetch(`${API_URL}/api`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'X-Api-Token': token } : {}),
    },
    body: JSON.stringify({ method, params: params.filter((p) => p !== undefined) }),
  });
  if (!res.ok) {
    throw new Error(`service error: HTTP ${res.status}`);
  }
  const data: { result?: T; error?: string } = await res.json();
  if (data.error) throw new Error(data.error);
  return data.result as T;
}

function startEvents(): void {
  const token = apiToken();
  if (!token) return;
  const es = new EventSource(`${API_URL}/events?token=${encodeURIComponent(token)}`);
  es.onmessage = (ev) => {
    try {
      const msg = JSON.parse(ev.data) as { kind: Parameters<typeof emit>[0]; payload: unknown };
      emit(msg.kind, msg.payload);
    } catch {
      // malformed frame — ignore, keep the stream open
    }
  };
  // EventSource reconnects automatically on drops; nothing else needed.
}

export function createHttpBridge(): BridgeApi {
  startEvents();
  return {
    get_state: () => call<AppState>('get_state'),
    browse_folder: async () => null, // headless: no native dialog; UI falls back to typed path
    toggle_theme: () => call<ThemeName>('toggle_theme'),
    toggle_language: () => call<LangCode>('toggle_language'),
    get_strings: (lang) => call<Record<string, string>>('get_strings', lang),
    analyze_folder: (path) => call<AnalysisReport>('analyze_folder', path),
    plan_sort: (path, mode) => call<PlanItem[]>('plan_sort', path, mode),
    start_sort: (path, move, mode) => call<boolean>('start_sort', path, move, mode),
    undo_sort: () => call<boolean>('undo_sort'),
    find_duplicates: (path) => call<boolean>('find_duplicates', path),
    delete_duplicates: (paths) => call<DupDeleteResult>('delete_duplicates', paths),
    scan_disk: (path) => call<boolean>('scan_disk', path),
    scan_cleanup: () => call<boolean>('scan_cleanup'),
    delete_cleanup: (ids) => call<CleanDeleteResult>('delete_cleanup', ids),
    add_watch_folder: (path) => call<boolean>('add_watch_folder', path),
    remove_watch_folder: (path) => call<boolean>('remove_watch_folder', path),
    start_watch: () => call<boolean>('start_watch'),
    stop_watch: () => call<boolean>('stop_watch'),
    save_categories: (categories, meta) => call<boolean>('save_categories', categories, meta),
    save_smart_rules: (rules) => call<boolean>('save_smart_rules', rules),
    restore_defaults: () => call<Record<string, string[]>>('restore_defaults'),
  };
}