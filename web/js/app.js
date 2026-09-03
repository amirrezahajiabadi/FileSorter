// ============================================
// FileSorter — Web UI (pywebview bridge)
// ============================================
// Talks to Python exclusively through pywebview.api.<method>(...),
// backed by the Api class in main_web.py → AppController.

// ── DOM Refs ─────────────────────────────────────────────────
var $ = function(s) { return document.querySelector(s); };
var $$ = function(s) { return document.querySelectorAll(s); };

var app, themeBtn, langBtn, langLabel, settingsBtn;
var folderPath, browseBtn, primaryBtn, fileCount;
var categoryGrid, logList;
var progressSection, progressFill, progressPercent, progressDetails;
var resultsSection, undoBtn;
var recentBtn, recentDropdown;
var addCategoryBtn;

// Modals
var settingsModal, settingsClose, settingsBody;
var editModal, editClose, editCancel;
var editCatName, editNameInput, editIconInput, editExtInput, addExtBtn;
var analysisModal, analysisClose, analysisChart, analysisTotal, analysisSize;
var analysisMoveToggle, analysisMoveWarning, analysisDupGroup;
var undoModal, undoClose, undoList, undoDate;
var moveConfirmOverlay;

// ── Helpers ──────────────────────────────────────────────────

function openModal(el) { el.classList.add('visible'); }
function closeModal(el) { el.classList.remove('visible'); }

// Convert Python categories dict {"images": [".jpg", ".png"]} to display array
function buildCategoriesArray(categoriesDict, lang, metaMap) {
    var arr = [];
    var keys = Object.keys(categoriesDict);
    for (var i = 0; i < keys.length; i++) {
        var id = keys[i];
        var exts = categoriesDict[id];
        var saved = (metaMap && metaMap[id]) || {};
        var meta = saved.icon || saved.nameEn || saved.nameFa
            ? saved
            : (CATEGORY_META[id] || { icon: '📁', nameEn: id, nameFa: id });
        var fallback = CATEGORY_META[id] || {};
        var icon = meta.icon || fallback.icon || '📁';
        var nameEn = meta.nameEn || fallback.nameEn || id;
        var nameFa = meta.nameFa || fallback.nameFa || id;
        arr.push({
            id: id,
            icon: icon,
            name: lang === 'fa' ? nameFa : nameEn,
            nameEn: nameEn,
            nameFa: nameFa,
            extensions: exts.map(function(e) { return e.replace('.', ''); }),
            count: 0,
            size: '0 B',
            status: 'idle',
        });
    }
    return arr;
}

// Convert display array back to Python dict format
function buildCategoriesDict(catsArray) {
    var dict = {};
    for (var i = 0; i < catsArray.length; i++) {
        dict[catsArray[i].id] = catsArray[i].extensions.map(function(e) {
            return e.startsWith('.') ? e : '.' + e;
        });
    }
    return dict;
}

// ── Splash screen ────────────────────────────────────────────

window.addEventListener('pywebviewready', async function() {
    // Cache DOM refs
    app = $('#app');
    themeBtn = $('#themeToggle');
    langBtn = $('#langToggle');
    langLabel = $('#langLabel');
    settingsBtn = $('#settingsToggle');
    folderPath = $('#folderPath');
    browseBtn = $('#browseBtn');
    primaryBtn = $('#primaryAction');
    fileCount = $('#fileCount');
    categoryGrid = $('#categoryGrid');
    logList = $('#logList');
    progressSection = $('#progressSection');
    progressFill = $('#progressFill');
    progressPercent = $('#progressPercent');
    progressDetails = $('#progressDetails');
    resultsSection = $('#resultsSection');
    undoBtn = $('#undoBtn');
    recentBtn = $('#recentBtn');
    recentDropdown = $('#recentDropdown');
    addCategoryBtn = $('#addCategoryBtn');

    settingsModal = $('#settingsModal');
    settingsClose = $('#settingsClose');
    settingsBody = $('#settingsBody');

    editModal = $('#editModal');
    editClose = $('#editClose');
    editCancel = $('#editCancel');
    editCatName = $('#editCatName');
    editNameInput = $('#editNameInput');
    editIconInput = $('#editIconInput');
    editExtInput = $('#editExtInput');
    addExtBtn = $('#addExtBtn');

    analysisModal = $('#analysisModal');
    analysisClose = $('#analysisClose');
    analysisChart = $('#analysisChart');
    analysisTotal = $('#analysisTotal');
    analysisSize = $('#analysisSize');
    analysisMoveToggle = $('#analysisMoveToggle');
    analysisMoveWarning = $('#analysisMoveWarning');
    analysisDupGroup = $('#analysisDupGroup');

    undoModal = $('#undoModal');
    undoClose = $('#undoClose');
    undoList = $('#undoList');
    undoDate = $('#undoDate');

    moveConfirmOverlay = $('#moveConfirmOverlay');

    // Fetch initial state from Python
    try {
        var state = await pywebview.api.get_state();
        State.theme = state.theme || 'dark';
        State.lang = state.language || 'fa';
        State.folder = '';
        State.recentFolders = state.recentFolders || [];
        
        // Display version
        var versionEl = document.getElementById("versionText");
        if (versionEl && state.version) {
            versionEl.textContent = "v" + state.version;
        }

        // Set theme
        app.setAttribute('data-theme', State.theme);
        document.documentElement.setAttribute('data-theme', State.theme);
        updateThemeIcon();

        // Set language
        State.strings = await pywebview.api.get_strings(State.lang);
        applyLanguage();

        // Build categories from Python data
        State.categoryMeta = state.categoryMeta || {};
        State.categories = buildCategoriesArray(state.categories, State.lang, State.categoryMeta);

        // Render everything
        renderCategories();
        renderLogs();
        updateUI();
        renderRecentFolders();

        // Wire up button event listeners
        browseBtn.addEventListener('click', browseFolder);
        themeBtn.addEventListener('click', toggleTheme);
        langBtn.addEventListener('click', toggleLang);
        settingsBtn.addEventListener('click', function() { openSettings(); });
        recentBtn.addEventListener('click', function() { toggleRecentMenu(); });
        addCategoryBtn.addEventListener('click', addNewCategory);

        // Wire up modal close buttons
        settingsClose.addEventListener('click', function() { closeModal(settingsModal); });
        editClose.addEventListener('click', function() { closeModal(editModal); });
        analysisClose.addEventListener('click', function() { closeModal(analysisModal); });
        undoClose.addEventListener('click', function() { closeModal(undoModal); });

    } catch (e) {
        console.error('Failed to initialize:', e);
    }

    // Hide splash
    var splash = document.getElementById('splash');
    if (splash) {
        splash.style.opacity = '0';
        setTimeout(function() { splash.remove(); }, 500);
    }
});


// ── Toast Notifications ──────────────────────────────────────
function showToast(message, type) {
    type = type || 'info';
    var toast = document.createElement('div');
    toast.className = 'toast toast-' + type;
    toast.innerHTML = '<span class="toast-icon">' + (type === 'success' ? '✅' : type === 'error' ? '❌' : type === 'warning' ? '⚠️' : 'ℹ️') + '</span><span class="toast-msg">' + escapeHtml(message) + '</span>';
    
    // Add to container or create one
    var container = document.getElementById('toastContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toastContainer';
        container.className = 'toast-container';
        document.body.appendChild(container);
    }
    
    container.appendChild(toast);
    
    // Auto remove after 3 seconds
    setTimeout(function() {
        toast.classList.add('toast-hide');
        setTimeout(function() {
            if (toast.parentNode) toast.parentNode.removeChild(toast);
        }, 300);
    }, 3000);
}


// ── Theme ────────────────────────────────────────────────────

async function toggleTheme() {
    var newTheme = await pywebview.api.toggle_theme();
    State.theme = newTheme;
    app.setAttribute('data-theme', newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
    updateThemeIcon();
}

function updateThemeIcon() {
    if (!themeBtn) return;
    var svg = State.theme === 'dark'
        ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>'
        : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
    themeBtn.innerHTML = svg;
}

// ── Language ─────────────────────────────────────────────────

async function toggleLang() {
    var newLang = await pywebview.api.toggle_language();
    State.lang = newLang;
    State.strings = await pywebview.api.get_strings(newLang);

    // Rebuild category names
    var catsDict = {};
    for (var i = 0; i < State.categories.length; i++) {
        catsDict[State.categories[i].id] = State.categories[i].extensions;
    }
    State.categories = buildCategoriesArray(catsDict, newLang, State.categoryMeta || {});

    applyLanguage();
    renderCategories();
    renderRecentFolders();
    updateUI();
}

function applyLanguage() {
    app.setAttribute('data-lang', State.lang);
    document.documentElement.setAttribute('dir', State.lang === 'fa' ? 'rtl' : 'ltr');
    document.documentElement.setAttribute('lang', State.lang);
    if (langLabel) {
        langLabel.textContent = State.lang === 'fa' ? 'فارسی' : 'English';
    }

    // Update all elements with data-i18n attribute
    var els = document.querySelectorAll('[data-i18n]');
    for (var i = 0; i < els.length; i++) {
        var key = els[i].getAttribute('data-i18n');
        if (State.strings[key]) {
            els[i].textContent = State.strings[key];
        }
    }
}

// ── Recent Folders ───────────────────────────────────────────

function renderRecentFolders() {
    if (!recentDropdown) return;
    var html = '';
    if (!State.recentFolders || State.recentFolders.length === 0) {
        html = '<div class="recent-empty">' + t('recent_folders_empty') + '</div>';
    } else {
        for (var i = 0; i < State.recentFolders.length; i++) {
            var path = State.recentFolders[i];
            html += '<div class="recent-item" onclick="selectRecentFolder(\'' + escapeHtml(path).replace(/'/g, "\\'") + '\')">' + escapeHtml(path) + '</div>';
        }
    }
    recentDropdown.innerHTML = html;
}

function selectRecentFolder(path) {
    setFolder(path);
    toggleRecentMenu(false);
}

function toggleRecentMenu(forceState) {
    if (!recentDropdown) return;
    var show = forceState !== undefined ? forceState : !recentDropdown.classList.contains('visible');
    if (show) {
        recentDropdown.classList.add('visible');
    } else {
        recentDropdown.classList.remove('visible');
    }
}

// Close recent dropdown when clicking outside
document.addEventListener('click', function(e) {
    if (recentDropdown && !recentDropdown.contains(e.target) && e.target !== recentBtn && !recentBtn.contains(e.target)) {
        recentDropdown.classList.remove('visible');
    }
});

// ── Folder Selection ─────────────────────────────────────────

async function browseFolder() {
    var path = await pywebview.api.browse_folder();
    if (!path) return;
    setFolder(path);
}

function setFolder(path) {
    State.folder = path;
    if (folderPath) {
        folderPath.textContent = path;
        folderPath.classList.add('selected');
    }
    if (primaryBtn) primaryBtn.disabled = false;
    log('info', '📂 ' + (State.lang === 'fa' ? 'پوشه انتخاب شد: ' : 'Folder selected: ') + path);
}

// ── Category Rendering ───────────────────────────────────────

function renderCategories() {
    if (!categoryGrid) return;
    var html = '';
    for (var i = 0; i < State.categories.length; i++) {
        var c = State.categories[i];
        var cls = c.status === 'done' ? 'done' : c.status === 'active' ? 'active' : c.status === 'pending' ? 'pending' : '';
        var badge = c.status === 'done' ? '✅' : c.status === 'active' ? '🔄' : c.status === 'pending' ? '⏳' : '';
        html += '<div class="category-card ' + cls + '">';
        html += '<div class="icon">' + c.icon + '</div>';
        html += '<div class="name">' + escapeHtml(c.name) + '</div>';
        html += '<div class="count">' + c.count + '</div>';
        if (c.size && c.size !== '0 B') {
            html += '<div class="size">' + escapeHtml(c.size) + '</div>';
        }
        if (badge) {
            html += '<div class="status-badge">' + badge + '</div>';
        }
        html += '</div>';
    }
    categoryGrid.innerHTML = html;
}

// ── Log Rendering ────────────────────────────────────────────

function renderLogs() {
    if (!logList) return;
    var html = '';
    var logs = State.logs.slice(-8);
    for (var i = 0; i < logs.length; i++) {
        var l = logs[i];
        var statusIcon = getStatusIcon(l.status);
        html += '<div class="log-entry ' + l.status + '">';
        html += '<span class="time">' + escapeHtml(l.time) + '</span>';
        html += '<span class="status">' + statusIcon + '</span>';
        html += '<span class="msg">' + escapeHtml(l.msg) + '</span>';
        html += '</div>';
    }
    logList.innerHTML = html;
    logList.scrollTop = logList.scrollHeight;
}

function log(status, msg) {
    State.logs.push({ time: now(), msg: msg, status: status });
    if (State.logs.length > 200) State.logs.shift();
    renderLogs();
}

// ── UI Update ────────────────────────────────────────────────

function updateUI() {
    // File count badge
    if (fileCount) {
        var countText = State.totalFiles > 0 ? State.totalFiles : '';
        fileCount.textContent = countText ? (countText + (State.lang === 'fa' ? ' فایل' : ' files')) : '';
    }

    // Progress
    if (progressFill) progressFill.style.width = State.progress + '%';
    if (progressPercent) progressPercent.textContent = Math.round(State.progress) + '%';
    if (progressDetails) {
        var done = State.currentFile;
        var total = State.totalFiles;
        if (State.lang === 'fa') {
            progressDetails.textContent = done + ' از ' + total + ' فایل';
        } else {
            progressDetails.textContent = done + ' of ' + total + ' files';
        }
    }

    // Screen visibility
    if (progressSection) {
        progressSection.className = 'progress-section' + (State.screen === 'progress' ? ' visible' : '');
    }
    if (resultsSection) {
        resultsSection.className = 'results-section' + (State.screen === 'completed' ? ' visible' : '');
    }

    // Primary button
    if (primaryBtn) {
        if (State.screen === 'idle') {
            var label = t('analyze_btn');
            primaryBtn.innerHTML = '<span>🔍</span> ' + escapeHtml(label) +
                (State.totalFiles > 0 ? ' <span class="badge">' + State.totalFiles + (State.lang === 'fa' ? ' فایل' : ' files') + '</span>' : '');
            primaryBtn.disabled = !State.folder;
        } else if (State.screen === 'progress') {
            primaryBtn.innerHTML = '<span class="spinner"></span> ' + escapeHtml(t('sorting_btn'));
            primaryBtn.disabled = true;
        } else {
            primaryBtn.innerHTML = '✅ ' + (State.lang === 'fa' ? 'تکمیل شد' : 'Completed');
            primaryBtn.disabled = true;
        }
    }

    // Undo button
    if (undoBtn) {
        undoBtn.style.display = State.hasUndoLog ? 'inline-flex' : 'none';
    }
}

// ── Settings Modal ───────────────────────────────────────────

function openSettings() {
    renderSettingsList();
    openModal(settingsModal);
}

function renderSettingsList() {
    if (!settingsBody) return;
    var html = '';
    for (var i = 0; i < State.categories.length; i++) {
        var c = State.categories[i];
        var extTags = '';
        var showExts = c.extensions.slice(0, 8);
        for (var j = 0; j < showExts.length; j++) {
            extTags += '<span class="ext-tag">' + showExts[j] + '</span>';
        }
        if (c.extensions.length > 8) {
            extTags += '<span class="ext-tag">+' + (c.extensions.length - 8) + '</span>';
        }
        html += '<div class="cat-list-item" data-id="' + c.id + '">';
        html += '<div class="cat-item-row">';
        html += '<div class="cat-item-left">';
        html += '<span class="icon">' + c.icon + '</span>';
        html += '<span class="name">' + escapeHtml(c.name) + '</span>';
        html += '<span class="ext-count">(' + c.extensions.length + ' ' + (State.lang === 'fa' ? 'پسوند' : 'exts') + ')</span>';
        html += '</div>';
        html += '<div class="cat-item-actions">';
        html += '<button class="edit-cat" onclick="openEditModal(\'' + c.id + '\')">✏️</button>';
        html += '<button class="delete delete-cat" onclick="deleteCategoryFromSettings(\'' + c.id + '\')">🗑️</button>';
        html += '</div>';
        html += '</div>';
        html += '<div class="cat-extensions">' + extTags + '</div>';
        html += '</div>';
    }
    html += '<button class="btn-add-category" onclick="addNewCategory()">' + (State.lang === 'fa' ? '+ افزودن دسته‌بندی جدید' : '+ Add New Category') + '</button>';
    settingsBody.innerHTML = html;
}

async function saveSettings() {
    var dict = buildCategoriesDict(State.categories);
    var meta = {};
    for (var i = 0; i < State.categories.length; i++) {
        var cat = State.categories[i];
        meta[cat.id] = { icon: cat.icon, nameEn: cat.nameEn, nameFa: cat.nameFa };
    }
    State.categoryMeta = meta;
    await pywebview.api.save_categories(dict, meta);
    closeModal(settingsModal);
    log('info', '✅ ' + (State.lang === 'fa' ? 'تنظیمات ذخیره شد' : 'Settings saved'));
}

async function restoreDefaults() {
    if (!confirm(State.lang === 'fa' ? 'بازگردانی به حالت پیش‌فرض؟' : 'Restore defaults?')) return;
    var dict = await pywebview.api.restore_defaults();
    State.categoryMeta = {};
    State.categories = buildCategoriesArray(dict, State.lang);
    renderSettingsList();
    renderCategories();
    updateUI();
}

function addNewCategory() {
    var id = 'custom_' + generateId();
    var newCat = {
        id: id,
        icon: '📁',
        name: State.lang === 'fa' ? 'دسته جدید' : 'New Category',
        nameEn: 'New Category',
        nameFa: 'دسته جدید',
        extensions: [],
        count: 0,
        size: '0 B',
        status: 'idle',
    };
    State.categories.push(newCat);
    renderSettingsList();
    renderCategories();
    openEditModal(id);
}

function deleteCategoryFromSettings(id) {
    if (id === 'others') return; // 'others' cannot be removed
    var msg = State.lang === 'fa' ? 'حذف دسته‌بندی؟' : 'Delete category?';
    if (!confirm(msg)) return;
    State.categories = State.categories.filter(function(c) { return c.id !== id; });
    renderSettingsList();
    renderCategories();
}

// ── Edit Category Modal ──────────────────────────────────────

function openEditModal(id) {
    var cat = State.categories.find(function(c) { return c.id === id; });
    if (!cat) return;
    State.selectedCategory = id;
    if (editCatName) editCatName.textContent = cat.name;
    if (editNameInput) editNameInput.value = cat.name;
    if (editIconInput) editIconInput.value = cat.icon;
    if (editExtInput) editExtInput.value = cat.extensions.join('\n');
    openModal(editModal);
}

function saveEdit() {
    var id = State.selectedCategory;
    if (!id) return;
    var name = editNameInput.value.trim();
    var icon = editIconInput.value.trim() || '📁';
    var exts = editExtInput.value.split('\n').map(function(s) { return s.trim().toLowerCase(); }).filter(function(s) { return s.length > 0; });
    if (!name) { alert(State.lang === 'fa' ? 'نام الزامی است' : 'Name is required'); return; }

    var cat = State.categories.find(function(c) { return c.id === id; });
    if (cat) {
        cat.name = name;
        cat.icon = icon;
        cat.extensions = exts;
        if (State.lang === 'fa') { cat.nameFa = name; } else { cat.nameEn = name; }
        if (!cat.nameEn) cat.nameEn = name;
        if (!cat.nameFa) cat.nameFa = name;
    }
    renderSettingsList();
    renderCategories();
    closeModal(editModal);
}

function deleteEditCategory() {
    var id = State.selectedCategory;
    if (!id || id === 'others') return;
    var msg = State.lang === 'fa' ? 'حذف دسته‌بندی؟' : 'Delete category?';
    if (!confirm(msg)) return;
    State.categories = State.categories.filter(function(c) { return c.id !== id; });
    renderSettingsList();
    renderCategories();
    closeModal(editModal);
}

function addExtensionToEdit() {
    if (!editExtInput) return;
    var current = editExtInput.value;
    editExtInput.value = current + (current ? '\n' : '') + 'new_ext';
    editExtInput.focus();
}

// ── Analysis Modal ───────────────────────────────────────────

async function startAnalysis() {
    if (!State.folder) return;

    primaryBtn.disabled = true;
    if (primaryBtn) {
        primaryBtn.innerHTML = '<span class="spinner"></span> ' + (State.lang === 'fa' ? 'در حال تحلیل...' : 'Analyzing...');
    }

    try {
        var report = await pywebview.api.analyze_folder(State.folder);
        if (report && report.error) {
            log('error', '❌ ' + report.error);
        showToast(report.error, 'error');
            resetPrimaryBtn();
            return;
        }
        showAnalysisModal(report);
    } catch (e) {
        log('error', '❌ ' + String(e));
        showToast(String(e), 'error');
    }
    resetPrimaryBtn();
}

function resetPrimaryBtn() {
    if (primaryBtn && State.screen === 'idle') {
        var label = t('analyze_btn');
        primaryBtn.innerHTML = '<span>🔍</span> ' + escapeHtml(label) +
            (State.totalFiles > 0 ? ' <span class="badge">' + State.totalFiles + (State.lang === 'fa' ? ' فایل' : ' files') + '</span>' : '');
        primaryBtn.disabled = !State.folder;
    }
}

function showAnalysisModal(report) {
    // Update category counts from analysis report
    
    // Display folder path
    var folderPathEl = document.getElementById("analysisFolderPath");
    if (folderPathEl) {
        folderPathEl.textContent = State.folder || "-";
    }
    var total = report.total || 0;
    var totalSize = report.total_size || 0;
    var byCategory = report.by_category || {};

    State.totalFiles = total;
    State.totalSize = totalSize;

    // Update category counts
    for (var i = 0; i < State.categories.length; i++) {
        var cat = State.categories[i];
        cat.count = byCategory[cat.id] || 0;
    }
    renderCategories();
    updateUI();

    // Render analysis chart
    if (analysisTotal) analysisTotal.innerHTML = '<strong>' + total + '</strong> ' + (State.lang === 'fa' ? 'فایل شناسایی شد' : 'files found');
    if (analysisSize) analysisSize.innerHTML = '<strong>' + formatSize(totalSize) + '</strong>';
    if (analysisChart) {
        var chartHtml = '';
        var colors = ['c0', 'c1', 'c2', 'c3', 'c4', 'c5'];
        var sortedCats = State.categories.slice().sort(function(a, b) { return b.count - a.count; });
        for (var j = 0; j < sortedCats.length; j++) {
            var c = sortedCats[j];
            if (c.count === 0) continue;
            var pct = total > 0 ? (c.count / total * 100) : 0;
            chartHtml += '<div class="chart-row">';
            chartHtml += '<span class="label">' + c.icon + ' ' + escapeHtml(c.name) + '</span>';
            chartHtml += '<div class="track"><div class="fill ' + colors[j % colors.length] + '" style="width:' + pct + '%;"></div></div>';
            chartHtml += '<div class="info"><span class="count">' + c.count + '</span> (' + pct.toFixed(0) + '%) <span>' + formatSize(c.count * (totalSize / total || 0)) + '</span></div>';
            chartHtml += '</div>';
        }
        analysisChart.innerHTML = chartHtml;
    }

    // Smart suggestions
    renderAnalysisSuggestions(report);

    openModal(analysisModal);
}

function renderAnalysisSuggestions(report) {
    var container = document.getElementById('analysisSuggestions');
    if (!container) return;
    var suggestions = [];
    var largeFiles = report.large_files || [];
    var oldFiles = report.old_files || [];
    var unknownExts = report.unknown_extensions || [];
    var othersCount = (report.by_category || {}).others || 0;

    if (largeFiles.length > 0) {
        suggestions.push('<div class="suggestion warning">⚠ ' + largeFiles.length + (State.lang === 'fa' ? ' فایل بزرگ (>۱۰۰MB)' : ' large file(s) (>100MB)') + '</div>');
    }
    if (oldFiles.length > 0) {
        suggestions.push('<div class="suggestion info">📅 ' + oldFiles.length + (State.lang === 'fa' ? ' فایل قدیمی (>۱ سال)' : ' old file(s) (>1 year)') + '</div>');
    }
    if (unknownExts.length > 0) {
        suggestions.push('<div class="suggestion error">❓ ' + (State.lang === 'fa' ? 'پسوند ناشناس: ' : 'Unknown: ') + unknownExts.slice(0, 5).join(', ') + '</div>');
    }
    if (othersCount > 5) {
        suggestions.push('<div class="suggestion info">📁 ' + othersCount + (State.lang === 'fa' ? ' فایل در «ناشناس»' : ' file(s) in "others"') + '</div>');
    }
    if (suggestions.length === 0) {
        suggestions.push('<div class="suggestion info">✅ ' + (State.lang === 'fa' ? 'مشکلی پیدا نشد' : 'No issues found') + '</div>');
    }
    container.innerHTML = suggestions.join('');
}

function getMoveMode() {
    return analysisMoveToggle ? analysisMoveToggle.checked : false;
}

function getDuplicateMode() {
    var checked = document.querySelector('input[name="dupMode"]:checked');
    return checked ? checked.value : 'skip';
}

function proceedWithSort() {
    var move = getMoveMode();
    closeModal(analysisModal);

    if (move) {
        // Show move confirmation
        openModal(moveConfirmOverlay);
        return;
    }
    startSort();
}

async function startSort() {
    if (!State.folder || State.isProcessing) return;

    var move = getMoveMode();
    var dupMode = getDuplicateMode();

    State.screen = 'progress';
    State.isProcessing = true;
    State.progress = 0;
    State.currentFile = 0;

    // Reset category statuses
    for (var i = 0; i < State.categories.length; i++) {
        State.categories[i].status = 'pending';
        State.categories[i].count = 0; // Will be updated as items come in
    }

    State.logs = [];
    renderCategories();
    renderLogs();
    updateUI();

    await pywebview.api.start_sort(State.folder, move, dupMode);
}

// ── Undo ─────────────────────────────────────────────────────

function showUndoModal() {
    if (!State.hasUndoLog) return;
    if (undoDate) {
        undoDate.textContent = State.lastSortTime || '-';
    }
    if (undoList) {
        // Group sort log by category
        var groups = {};
        for (var i = 0; i < State.sortLog.length; i++) {
            var entry = State.sortLog[i];
            var cat = entry.category || 'unknown';
            if (!groups[cat]) groups[cat] = [];
            groups[cat].push(entry.name || entry.final_name || '?');
        }
        var html = '';
        var catKeys = Object.keys(groups);
        for (var j = 0; j < catKeys.length; j++) {
            var catId = catKeys[j];
            var meta = CATEGORY_META[catId] || { icon: '📁', nameEn: catId, nameFa: catId };
            var catName = State.lang === 'fa' ? meta.nameFa : meta.nameEn;
            var files = groups[catId];
            html += '<div class="undo-group">';
            html += '<div class="undo-group-header">';
            html += '<span class="icon">' + meta.icon + '</span>';
            html += '<span class="name">' + catName + '</span>';
            html += '<span class="count">' + files.length + (State.lang === 'fa' ? ' فایل' : ' files') + '</span>';
            html += '</div>';
            html += '<div class="undo-group-items">';
            for (var k = 0; k < files.length; k++) {
                html += '<div class="undo-item"><span class="check">✅</span> ' + escapeHtml(files[k]) + '</div>';
            }
            html += '</div></div>';
        }
        undoList.innerHTML = html || '<p style="color:var(--text-muted);padding:12px;">' + (State.lang === 'fa' ? 'چیزی برای بازگرداندن نیست' : 'Nothing to undo') + '</p>';
    }
    openModal(undoModal);
}

async function undoLastSort() {
    if (!State.hasUndoLog) return;
    var msg = State.lang === 'fa'
        ? 'آخرین مرتب‌سازی برگردانده شود؟ فایل‌های منتقل‌شده به مکان اصلی برمی‌گردند.'
        : 'Undo last sort? Moved files will be restored.';
    if (!confirm(msg)) return;

    closeModal(undoModal);
    State.screen = 'progress';
    State.isProcessing = true;
    State.progress = 0;
    State.currentFile = 0;
    State.logs = [];
    renderLogs();
    updateUI();

    await pywebview.api.undo_sort();
}

// ── Move Confirmation ────────────────────────────────────────

function confirmMove() {
    closeModal(moveConfirmOverlay);
    startSort();
}

function cancelMove() {
    closeModal(moveConfirmOverlay);
}

// ── Results Actions ──────────────────────────────────────────

function resetApp() {
    State.screen = 'idle';
    State.isProcessing = false;
    State.progress = 0;
    State.currentFile = 0;
    State.totalFiles = 0;
    State.totalSize = 0;
    State.hasUndoLog = false;
    State.sortLog = [];
    for (var i = 0; i < State.categories.length; i++) {
        State.categories[i].status = 'idle';
        State.categories[i].count = 0;
    }
    renderCategories();
    renderLogs();
    updateUI();
}

function redoSort() {
    if (!State.folder) return;
    resetApp();
    setTimeout(function() { startAnalysis(); }, 300);
}

function viewFullLog() {
    var text = '';
    for (var i = 0; i < State.logs.length; i++) {
        text += State.logs[i].time + '  ' + State.logs[i].msg + '\n';
    }
    alert(text || (State.lang === 'fa' ? 'لاگی موجود نیست' : 'No log entries'));
}

// ── Event handler (called from Python) ────────────────────────

window.onSortEvent = function(event) {
    var kind = event.kind;
    var payload = event.payload;

    if (kind === 'total') {
        State.totalFiles = payload;
        State.currentFile = 0;
        State.progress = 0;

        // Reset category counts
        for (var i = 0; i < State.categories.length; i++) {
            State.categories[i].count = 0;
            State.categories[i].status = 'pending';
        }

        updateUI();
        renderCategories();

    } else if (kind === 'progress') {
        State.currentFile = payload;
        State.progress = State.totalFiles > 0 ? (payload / State.totalFiles * 100) : 0;
        updateUI();

        // Update category statuses based on actual counts from item events
        var runningTotal = 0;
        for (var i = 0; i < State.categories.length; i++) {
            runningTotal += (State.categories[i].count || 0);
            if (State.categories[i].count > 0 && runningTotal <= payload) {
                State.categories[i].status = 'done';
            } else if (State.categories[i].count > 0 && runningTotal > payload) {
                State.categories[i].status = 'active';
            }
        }
        renderCategories();

    } else if (kind === 'item') {
        var status = payload.status;
        var name = payload.name || payload.final_name || '?';
        var category = payload.category || '';

        if (status === 'ok') {
            var action = payload.action === 'moved' ? (State.lang === 'fa' ? 'منتقل شد' : 'Moved') : (State.lang === 'fa' ? 'کپی شد' : 'Copied');
            log('success', name + ' → ' + category + '/ (' + action + ')');

            // Increment category count
            var cat = State.categories.find(function(c) { return c.id === category; });
            if (cat) cat.count++;

        } else if (status === 'skip') {
            log('warning', name + ' — ' + (State.lang === 'fa' ? 'رد شد (تکراری)' : 'Skipped (duplicate)'));

        } else if (status === 'error') {
            log('error', name + ' — ' + (payload.error || 'error'));

        } else if (status === 'restored') {
            log('success', '↩ ' + (State.lang === 'fa' ? 'بازگردانده شد: ' : 'Restored: ') + name);

        } else if (status === 'removed') {
            log('warning', '↩ ' + (State.lang === 'fa' ? 'کپی حذف شد: ' : 'Removed copy: ') + name);

        } else if (status === 'failed') {
            log('error', '↩ ' + (State.lang === 'fa' ? 'خطا در بازگرداندن: ' : 'Undo failed: ') + name + ' — ' + (payload.error || ''));
        }

        renderCategories();
        renderLogs();

    } else if (kind === 'done') {
        State.screen = 'completed';
        State.isProcessing = false;
        State.lastSortTime = now();

        if (payload.nothing) {
            // Undo had nothing to do
            log('info', State.lang === 'fa' ? 'چیزی برای بازگرداندن نیست' : 'Nothing to undo');
            State.screen = 'idle';
            State.hasUndoLog = false;
        } else if (payload.restored !== undefined) {
            // Undo completed
            log('success', '↩ ' + (State.lang === 'fa' ? 'بازگردانی انجام شد' : 'Undo complete') +
                ' — ' + payload.restored + ' ' + (State.lang === 'fa' ? 'بازگردانده' : 'restored') +
                ', ' + payload.removed + ' ' + (State.lang === 'fa' ? 'کپی حذف شد' : 'copies removed') +
                ', ' + payload.failed + ' ' + (State.lang === 'fa' ? 'خطا' : 'failed'));
            State.hasUndoLog = false;
            State.sortLog = [];
            State.screen = 'idle';
        } else {
            // Sort completed
            var copied = payload.copied || 0;
            var skipped = payload.skipped || 0;
            var errors = payload.errors || 0;
            log('success', '🎉 ' + (State.lang === 'fa' ? 'مرتب‌سازی تمام شد' : 'Sort complete') +
                ' — ' + copied + ' ' + (State.lang === 'fa' ? 'کپی' : 'copied') +
                ', ' + skipped + ' ' + (State.lang === 'fa' ? 'رد شده' : 'skipped') +
                ', ' + errors + ' ' + (State.lang === 'fa' ? 'خطا' : 'errors'));
            State.hasUndoLog = true;
            State.sortLog = payload.sort_log || [];

            // Show toast
            showToast(State.lang === 'fa' ? 'مرتبسازی با موفقیت انجام شد!' : 'Sort completed successfully!', 'success');

            // Populate results summary
            var resultsSummaryEl = document.getElementById('resultsSummary');
            if (resultsSummaryEl) {
                var summaryHtml = '';
                summaryHtml += '<div class="summary-item success"><div class="value">' + copied + '</div><div class="label">' + (State.lang === 'fa' ? 'کپی' : 'Copied') + '</div></div>';
                summaryHtml += '<div class="summary-item warning"><div class="value">' + skipped + '</div><div class="label">' + (State.lang === 'fa' ? 'رد شده' : 'Skipped') + '</div></div>';
                summaryHtml += '<div class="summary-item error"><div class="value">' + errors + '</div><div class="label">' + (State.lang === 'fa' ? 'خطا' : 'Errors') + '</div></div>';
                summaryHtml += '<div class="summary-item info"><div class="value">' + State.totalFiles + '</div><div class="label">' + (State.lang === 'fa' ? 'کل' : 'Total') + '</div></div>';
                resultsSummaryEl.innerHTML = summaryHtml;
            }

            // Results subtitle (output folder)
            var resultsSubtitle = document.getElementById('resultsSubtitle');
            if (resultsSubtitle) {
                var outDir = payload.target_dir || '';
                resultsSubtitle.textContent = (State.lang === 'fa' ? 'خروجی در پوشه: ' : 'Output folder: ') + outDir;
            }
        }

        // Set all categories to done
        for (var i = 0; i < State.categories.length; i++) {
            State.categories[i].status = 'done';
        }

        renderCategories();
        renderLogs();
        updateUI();

    } else if (kind === 'error') {
        State.screen = 'idle';
        State.isProcessing = false;
        log('error', '❌ ' + (State.lang === 'fa' ? 'خطای بحرانی: ' : 'Fatal error: ') + payload);
        showToast(payload, 'error');
        renderCategories();
        updateUI();
    }
};

// ── Event Listeners ──────────────────────────────────────────

document.addEventListener('DOMContentLoaded', function() {
    // These are set up after pywebviewready since we cache refs there,
    // but we still need to bind some events early.

    // Move toggle warning
    var moveToggle = document.getElementById('analysisMoveToggle');
    if (moveToggle) {
        moveToggle.addEventListener('change', function() {
            var warning = document.getElementById('analysisMoveWarning');
            if (warning) warning.style.display = moveToggle.checked ? 'block' : 'none';
        });
    }
});

// Keyboard shortcuts
document.addEventListener('keydown', function(e) {
    // Don't fire shortcuts when typing in input fields
    var tag = document.activeElement ? document.activeElement.tagName : '';
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;

    if (e.key === 'Escape') {
        var modals = [settingsModal, editModal, analysisModal, undoModal, moveConfirmOverlay];
        for (var i = 0; i < modals.length; i++) {
            if (modals[i] && modals[i].classList.contains('visible')) {
                closeModal(modals[i]);
            }
        }
    }
    if (e.ctrlKey && e.key === 'd') { e.preventDefault(); toggleTheme(); }
    if (e.ctrlKey && e.key === 's') { e.preventDefault(); openSettings(); }
    // Enter shortcut only fires when no input is focused
    if (e.key === 'Enter' && State.screen === 'idle' && State.folder && tag !== 'INPUT' && tag !== 'TEXTAREA') { startAnalysis(); }
});
