// FileSorter — Web UI main screen logic (v4.2).
//
// Talks to Python exclusively through pywebview.api.<method>(...), which
// is backed by the Api class in main_web.py — which itself only calls
// AppController (app/controller.py). No business logic lives here; this
// file only updates the DOM in response to user actions and events
// pushed from Python (see window.onSortEvent at the bottom).

let selectedFolder = null;
let categoryColors = {};

// ── Startup ──────────────────────────────────────────────────────
window.addEventListener("pywebviewready", async () => {
  const state = await pywebview.api.get_state();

  document.getElementById("versionText").textContent = "v" + state.version;
  document.documentElement.setAttribute("data-theme", state.theme);
  updateThemeIcon(state.theme);

  categoryColors = buildCategoryColorMap(Object.keys(state.categories));
  renderCategoryLegend(state.categories);
  renderRecentMenu(state.recentFolders);
});

// ── Category legend ──────────────────────────────────────────────
// Cycles through the design system's --cat-* colors for whatever
// categories the user actually has (including custom ones they've
// added in Settings — not a hardcoded list).
const CATEGORY_COLOR_VARS = [
  "--cat-images", "--cat-documents", "--cat-videos", "--cat-audio",
  "--cat-archives", "--cat-code", "--cat-data", "--cat-ebooks",
  "--cat-executables", "--cat-fonts", "--cat-others",
];

function buildCategoryColorMap(categoryNames) {
  const map = {};
  categoryNames.forEach((name, i) => {
    map[name] = CATEGORY_COLOR_VARS[i % CATEGORY_COLOR_VARS.length];
  });
  return map;
}

function renderCategoryLegend(categories) {
  const el = document.getElementById("categoryLegend");
  el.innerHTML = "";
  Object.keys(categories).forEach((name) => {
    const chip = document.createElement("span");
    chip.className = "chip";
    chip.innerHTML =
      `<span class="dot" style="background:var(${categoryColors[name]})"></span>${name}`;
    el.appendChild(chip);
  });
}

// ── Folder selection ─────────────────────────────────────────────
async function browseFolder() {
  const path = await pywebview.api.browse_folder();
  if (!path) return;
  setFolder(path);
}

function setFolder(path) {
  selectedFolder = path;
  const pathEl = document.getElementById("folderPath");
  pathEl.textContent = path;
  pathEl.classList.add("selected");
  document.getElementById("sortBtn").disabled = false;
  log("info", `Folder selected: ${path}`);
}

// ── Recent folders ────────────────────────────────────────────────
function renderRecentMenu(recentFolders) {
  const menu = document.getElementById("recentMenu");
  menu.innerHTML = "";
  if (!recentFolders || recentFolders.length === 0) {
    menu.innerHTML = '<span class="text-dim" style="font-size:12px; padding:4px;">No recent folders yet</span>';
    return;
  }
  recentFolders.forEach((path) => {
    const item = document.createElement("div");
    item.className = "path";
    item.style.cssText = "padding:8px; cursor:pointer; border-radius:6px; font-size:12px;";
    item.textContent = path;
    item.onclick = () => {
      setFolder(path);
      toggleRecentMenu(false);
    };
    menu.appendChild(item);
  });
}

function toggleRecentMenu(forceState) {
  const menu = document.getElementById("recentMenu");
  const show = forceState !== undefined ? forceState : menu.style.display === "none";
  menu.style.display = show ? "block" : "none";
}

// ── Theme ─────────────────────────────────────────────────────────
async function toggleTheme() {
  const newTheme = await pywebview.api.toggle_theme();
  document.documentElement.setAttribute("data-theme", newTheme);
  updateThemeIcon(newTheme);
}

function updateThemeIcon(theme) {
  document.getElementById("themeBtn").textContent = theme === "dark" ? "☀️" : "🌙";
}

// ── Sorting ───────────────────────────────────────────────────────
let currentTotal = 0;

async function startSort() {
  if (!selectedFolder) return;

  document.getElementById("sortBtn").disabled = true;
  document.getElementById("sortBtn").textContent = "⏳ Sorting...";
  document.getElementById("logArea").innerHTML = "";
  currentTotal = 0;
  setProgress(0, 0);

  await pywebview.api.start_sort(selectedFolder);
  // Progress/log/completion all arrive via window.onSortEvent below —
  // start_sort() only confirms the background thread started.
}

function setProgress(done, total) {
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;
  document.getElementById("progressFill").style.width = percent + "%";
  document.getElementById("progressCount").textContent =
    total > 0 ? `${done} / ${total} files` : "Ready";
  document.getElementById("progressPercent").textContent = total > 0 ? percent + "%" : "";
}

// Called from Python (Api._push in main_web.py) via window.evaluate_js
// while a sort is running. This is the ONLY way progress data reaches
// this page — there is no polling.
window.onSortEvent = function (event) {
  const { kind, payload } = event;

  if (kind === "total") {
    currentTotal = payload;
    setProgress(0, currentTotal);
  } else if (kind === "progress") {
    setProgress(payload, currentTotal);
  } else if (kind === "item") {
    logItem(payload);
  } else if (kind === "done") {
    document.getElementById("sortBtn").disabled = false;
    document.getElementById("sortBtn").textContent = "▶ Analyze & Sort";
    log("done", `Done — ${payload.copied} copied, ${payload.skipped} skipped, ${payload.errors} errors`);
  } else if (kind === "error") {
    document.getElementById("sortBtn").disabled = false;
    document.getElementById("sortBtn").textContent = "▶ Analyze & Sort";
    log("err", `Fatal error: ${payload}`);
  }
};

function logItem(payload) {
  if (payload.status === "skip") {
    log("skip", `Skipped (duplicate): ${payload.name}`);
  } else if (payload.status === "ok") {
    log("ok", `${payload.action === "moved" ? "Moved" : "Copied"}: ${payload.name} → ${payload.category}/`);
  } else if (payload.status === "error") {
    log("err", `Error: ${payload.name} — ${payload.error}`);
  }
}

function log(tag, text) {
  const area = document.getElementById("logArea");
  const line = document.createElement("div");
  line.className = "line";
  const tagClass = { ok: "ok", skip: "skip", err: "err", done: "ok", info: "" }[tag] || "";
  line.innerHTML = `<span class="tag ${tagClass}">${tag}</span><span class="rest">${text}</span>`;
  area.appendChild(line);
  area.scrollTop = area.scrollHeight;
}
