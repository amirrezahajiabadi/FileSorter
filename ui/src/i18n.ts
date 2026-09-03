/**
 * Translation lookup. Strings come from the Python side (the real,
 * complete table in app/i18n.py); the transport mock provides a small
 * fallback so the UI works in a plain browser.
 */

import type { LangCode } from './protocol';

export type StringTable = Record<string, string>;

/** Look up one key, returning the key itself if it is missing. */
export function t(strings: StringTable, key: string): string {
  return strings[key] ?? key;
}

export function langDir(lang: LangCode): 'rtl' | 'ltr' {
  return lang === 'fa' ? 'rtl' : 'ltr';
}
