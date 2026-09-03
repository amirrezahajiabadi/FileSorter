// ============================================
// State Management
// ============================================

const State = {
    theme: 'dark',
    lang: 'fa',
    screen: 'idle',       // 'idle' | 'progress' | 'completed'
    folder: '',
    categories: [],       // Populated from pywebview.api.get_state() on init
    categoryMeta: {},     // Persisted display metadata (icon, names) per category
    recentFolders: [],
    logs: [],
    totalFiles: 0,
    totalSize: 0,
    progress: 0,
    currentFile: 0,
    isProcessing: false,
    selectedCategory: null,
    sortLog: [],          // For undo display
    lastSortTime: null,
    hasUndoLog: false,
    strings: {},          // i18n strings from Python
};

// ============================================
// State Subscribers
// ============================================

const subscribers = [];

function subscribe(callback) {
    subscribers.push(callback);
}

function notify() {
    subscribers.forEach(cb => cb(State));
}

function setState(updates) {
    Object.assign(State, updates);
    notify();
}
