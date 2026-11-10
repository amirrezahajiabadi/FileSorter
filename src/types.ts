// Types shared with the Rust backend (serde-serialized shapes).

export interface PlannedMove {
  source: string;
  destination: string;
  category: string;
  size: number;
  matched_rule?: string | null;
}

export interface SmartRule {
  id: string;
  name: string;
  category: string;
  keywords: string[];
}

export interface JunkLocation {
  id: string;
  name: string;
  description: string;
  paths: string[];
  file_count: number;
  total_bytes: number;
}

export interface CleanReport {
  files_deleted: number;
  bytes_freed: number;
  files_failed: number;
  skipped_locked: string[];
}

export interface WatchEventPayload {
  folder: string;
  filename: string;
  category: string;
  action: string;
  timestamp: number;
  error?: string | null;
}

export interface WatchStatus {
  active: boolean;
  folders: string[];
  recent_events: WatchEventPayload[];
}

export interface ScheduledTask {
  id: string;
  name: string;
  kind: "junk" | "sort";
  folder?: string | null;
  interval_minutes: number;
  enabled: boolean;
  last_run?: number | null;
}

export interface TaskRunResult {
  task_id: string;
  task_name: string;
  success: boolean;
  summary: string;
  timestamp: number;
}

export interface DriveInfo {
  letter: string;
  path: string;
  total_bytes: number;
  free_bytes: number;
  used_bytes: number;
}

export interface UpdateCheckResult {
  current_version: string;
  latest_version: string;
  has_update: boolean;
  release_name: string;
  release_notes: string;
  published_at: string;
  download_url: string;
  html_url: string;
}

export interface SortPlan {
  root: string;
  output_dir: string;
  moves: PlannedMove[];
  total_moves?: number;
  counts: [string, number][];
  total_size: number;
}

export interface ExecReport {
  moved: number;
  skipped: number;
  bytes_moved: number;
  skipped_examples: string[];
  journal: string;
  op_id: number;
}

export interface DupFile {
  path: string;
  size: number;
  modified: number;
  is_keeper: boolean;
}

export interface DuplicateGroup {
  hash: string;
  size: number;
  wasted: number;
  files: DupFile[];
}

export interface UndoReport {
  restored: number;
  restored_empty: number;
  skipped: number;
  skipped_examples: string[];
  op_id: number;
}

export interface ScanProgress {
  total_so_far: number;
  bytes_so_far: number;
  batch_files: number;
  done: boolean;
}

export interface DiskStats {
  total_files: number;
  total_bytes: number;
  largest_files: [string, number][];
  category_breakdown: [string, number, number][];
}

export type CategoryMap = Record<string, string[]>;

// Category display names are locale-dependent and live in `i18n.ts`
// (`CATEGORY_LABELS` / `getCategoryLabel`) so both languages stay in one place.


export interface ExtractedImagePayload {
  filename: string;
  data: number[];
}

export interface SaveImagesReport {
  target_dir: string;
  saved_count: number;
  total_bytes: number;
  file_paths: string[];
}

export interface RenamePair {
  original_path: string;
  new_name: string;
}

export interface BatchRenameReport {
  successful: number;
  failed: number;
  renamed_pairs: [string, string][];
  errors: string[];
}

export interface UndoRenameReport {
  restored: number;
  failed: number;
  errors: string[];
}

export interface ProcessedImagePayload {
  original_path: string;
  output_filename: string;
  data: number[];
}

export interface ImageOptimizationReport {
  target_dir: string;
  saved_count: number;
  original_total_bytes: number;
  new_total_bytes: number;
  saved_bytes: number;
}

export interface ExtrasScan {
  root: string;
  empty_dirs: string[];
  empty_files: string[];
  scanned_entries: number;
}

export interface ExtrasReport {
  dirs_removed: number;
  files_removed: number;
  failed: number;
  op_id: number;
}

export interface HistoryEntry {
  op_id: number;
  timestamp_ms: number;
  files: number;
  bytes: number;
  kind: string;
  empty_entries: number;
}

/** Paths handed to a tool by drag & drop; `seq` makes each drop unique. */
export interface DroppedPaths {
  paths: string[];
  seq: number;
}

