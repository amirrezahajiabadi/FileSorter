/**
 * Live event registry — the one place page-bound events land, shared by
 * every transport:
 *
 * - Desktop (pywebview): Python calls window.onSortEvent(...) directly.
 * - Headless service: the EventSource in http.ts feeds emit().
 * - Mock (browser dev, no backend): emits on a timer.
 *
 * The store subscribes once at init via subscribeEvents(); transports
 * never talk to the store directly.
 */

import type { EventKind } from './protocol';

export type SortEvent = { kind: EventKind; payload: unknown };

const listeners = new Set<(msg: SortEvent) => void>();

function syncDesktopHandler(): void {
  if (typeof window === 'undefined') return;
  // pywebview can inject its API after this module subscribes. Assigning the
  // callback eagerly is safe in a normal browser and prevents the desktop
  // bridge from losing every progress/completion event during startup.
  window.onSortEvent = listeners.values().next().value;
}

export function isDesktop(): boolean {
  return typeof window !== 'undefined' && !!window.pywebview?.api;
}

export function subscribeEvents(cb: (msg: SortEvent) => void): () => void {
  listeners.add(cb);
  syncDesktopHandler();
  return () => {
    listeners.delete(cb);
    if (typeof window !== 'undefined' && window.onSortEvent === cb) {
      syncDesktopHandler();
    }
  };
}

export function emit(kind: EventKind, payload: unknown): void {
  const msg: SortEvent = { kind, payload };
  listeners.forEach((cb) => cb(msg));
}