// Placeholder entry point. Phase 3 will replace this with real screen
// logic that calls pywebview.api.<method>(...) to talk to AppController —
// see poc/webview_poc.py for the pattern this will follow.

function toggleTheme() {
  const html = document.documentElement;
  const isDark = html.getAttribute("data-theme") === "dark";
  html.setAttribute("data-theme", isDark ? "light" : "dark");
}

// Default to light (matches the Tkinter app's default), matching the
// absence of data-theme in theme-vars.css's :root block.
