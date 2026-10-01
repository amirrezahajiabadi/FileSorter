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
 *
 * Events are dispatched synchronously but the store batches them (see
 * store.ts flushBatch) so a burst of N files costs one render instead of
 * N.
 */

import type { EventKind } from './protocol';

export type SortEvent = { kind: EventKind; payload: unknown };

const listeners = new Set<(msg: SortEvent) => void>();

function syncDesktopHandler(): void {
  if (typeof window === 'undefined') return;
  // pywebview can inject its API after this module subscribes. Assigning the
  // callback eagerly is safe in a normal browser and prevents the desktop
  // bridge from losing every progress/completion event during startup.
  window.onSortEvent = listeners.values().next().value ?? window.onSortEvent;
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
  // Use a snapshot to avoid issues if a listener removes itself during iteration.
  const snapshot = Array.from(listeners);
  for (const cb of snapshot) {
    try {
      cb(msg);
    } catch (e) {
      // One failing listener must not block the rest.
      console.error('event listener error:', e);
    }
  }
}