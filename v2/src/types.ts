// Types shared with the Rust backend (serde-serialized shapes).

export interface PlannedMove {
  source: string;
  destination: string;
  category: string;
  size: number;
}

export interface SortPlan {
  root: string;
  output_dir: string;
  moves: PlannedMove[];
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

export const CATEGORY_LABELS: Record<string, string> = {
  images: "تصاویر",
  documents: "اسناد",
  videos: "ویدیوها",
  audio: "صداها",
  archives: "آرشیوها",
  code: "کدها",
  data: "داده‌ها",
  ebooks: "کتاب‌ها",
  executables: "اجرایی‌ها",
  fonts: "فونت‌ها",
  others: "سایر",
};

export const CATEGORY_ICONS: Record<string, string> = {
  images: "◧",
  documents: "≡",
  videos: "▶",
  audio: "♪",
  archives: "▣",
  code: "⌗",
  data: "{}",
  ebooks: "❑",
  executables: "⚙",
  fonts: "A",
  others: "•",
};
