/** Small shared formatters (mirror the Python-side helpers). */

/** Byte count to a human size string: '842.2 MB' (matches Python format_size). */
export function formatSize(bytes: number): string {
  let v = bytes;
  for (const unit of ['B', 'KB', 'MB', 'GB']) {
    if (v < 1024) {
      return `${v.toFixed(1)} ${unit}`;
    }
    v /= 1024;
  }
  return `${v.toFixed(1)} TB`;
}

export function percent(done: number, total: number): number {
  return total > 0 ? Math.round((done / total) * 100) : 0;
}
