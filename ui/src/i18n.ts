/**
 * Translation lookup. Strings come from the Python side (the real,
 * complete table in app/i18n.py); the transport mock uses a generated
 * mirror so the UI works in a plain browser.
 */

import type { LangCode } from './protocol';

export type StringTable = Record<string, string>;

/** Look up one key, returning the key itself if it is missing. */
export function t(strings: StringTable, key: string): string {
  return strings[key] ?? key;
}

/** Fill {placeholders} in an i18n template string. */
export function fmt(template: string, vars: Record<string, string | number>): string {
  let out = template;
  for (const [key, val] of Object.entries(vars)) {
    out = out.split('{' + key + '}').join(String(val));
  }
  return out;
}

/** Flatten a multi-line template to a single readable line. */
export function inline(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export function langDir(lang: LangCode): 'rtl' | 'ltr' {
  return lang === 'fa' ? 'rtl' : 'ltr';
}
