import { useState, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { BatchRenameReport, RenamePair, UndoRenameReport } from "./types";
import { fmt, getStrings, type Locale } from "./i18n";

interface FileEntry {
  id: string;
  fullPath: string;
  originalName: string;
  stem: string;
  ext: string;
  parentDir: string;
}

type RenameMethod = "replace" | "affix" | "numbering" | "case" | "extension";

export default function BatchRenamer({ lang }: { lang: Locale }) {
  const t = getStrings(lang);
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [method, setMethod] = useState<RenameMethod>("replace");

  // Options: Find & Replace
  const [findText, setFindText] = useState("");
  const [replaceText, setReplaceText] = useState("");
  const [useRegex, setUseRegex] = useState(false);
  const [matchCase, setMatchCase] = useState(false);

  // Options: Prefix / Suffix
  const [prefix, setPrefix] = useState("");
  const [suffix, setSuffix] = useState("");

  // Options: Numbering
  const [numberPrefix, setNumberPrefix] = useState("");
  const [numberSuffix, setNumberSuffix] = useState("");
  const [startNum, setStartNum] = useState(1);
  const [padding, setPadding] = useState(2); // e.g. 01, 001
  const [keepOriginalName, setKeepOriginalName] = useState(true);

  // Options: Case
  const [caseType, setCaseType] = useState<"lower" | "upper" | "title" | "kebab" | "snake">("lower");

  // Options: Extension
  const [customExt, setCustomExt] = useState("");
  const [lowercaseExt, setLowercaseExt] = useState(false);

  // State
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [report, setReport] = useState<BatchRenameReport | null>(null);
  const [undoReport, setUndoReport] = useState<UndoRenameReport | null>(null);

  // ── File Pickers ──────────────────────────────────────────────────
  const addFiles = async () => {
    setError("");
    setReport(null);
    setUndoReport(null);
    try {
      const paths = await invoke<string[] | null>("pick_files_for_rename");
      if (!paths || paths.length === 0) return;
      appendPaths(paths);
    } catch (e) {
      setError(String(e));
    }
  };

  const addFolder = async () => {
    setError("");
    setReport(null);
    setUndoReport(null);
    try {
      const paths = await invoke<string[] | null>("pick_folder_for_rename");
      if (!paths || paths.length === 0) return;
      appendPaths(paths);
    } catch (e) {
      setError(String(e));
    }
  };

  const appendPaths = (paths: string[]) => {
    // De-duplicate inside the updater: reading the closed-over `files` state
    // let two quick "add folder" clicks enqueue the same path twice, which
    // then sent duplicate rename pairs to the backend.
    setFiles((prev) => {
      const seen = new Set(prev.map((f) => f.fullPath));
      const newItems: FileEntry[] = [];
      for (const p of paths) {
        if (seen.has(p)) continue;
        seen.add(p);
        const normalized = p.replace(/\\/g, "/");
        const parts = normalized.split("/");
        const originalName = parts[parts.length - 1] || "file";
        const parentDir = parts.slice(0, -1).join("/");

        const lastDot = originalName.lastIndexOf(".");
        const stem = lastDot > 0 ? originalName.slice(0, lastDot) : originalName;
        const ext = lastDot > 0 ? originalName.slice(lastDot + 1) : "";

        newItems.push({
          id: `${p}_${Date.now()}_${Math.random()}`,
          fullPath: p,
          originalName,
          stem,
          ext,
          parentDir,
        });
      }
      return [...prev, ...newItems];
    });
  };

  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const clearAll = () => {
    setFiles([]);
    setReport(null);
    setUndoReport(null);
  };

  // ── Generate Planned Names ────────────────────────────────────────
  const plannedList = useMemo(() => {
    return files.map((file, idx) => {
      let newStem = file.stem;
      let newExt = file.ext;

      if (method === "replace" && findText) {
        if (useRegex) {
          try {
            const re = new RegExp(findText, matchCase ? "g" : "gi");
            newStem = newStem.replace(re, replaceText);
          } catch {
            // invalid regex, keep stem
          }
        } else {
          if (matchCase) {
            newStem = newStem.split(findText).join(replaceText);
          } else {
            const re = new RegExp(findText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
            newStem = newStem.replace(re, replaceText);
          }
        }
      } else if (method === "affix") {
        newStem = `${prefix}${newStem}${suffix}`;
      } else if (method === "numbering") {
        const numStr = String(startNum + idx).padStart(padding, "0");
        if (keepOriginalName) {
          newStem = `${numberPrefix}${newStem}${numberSuffix}${numStr}`;
        } else {
          newStem = `${numberPrefix}${numStr}${numberSuffix}`;
        }
      } else if (method === "case") {
        if (caseType === "lower") {
          newStem = newStem.toLowerCase();
        } else if (caseType === "upper") {
          newStem = newStem.toUpperCase();
        } else if (caseType === "title") {
          newStem = newStem.replace(/\b\w/g, (c) => c.toUpperCase());
        } else if (caseType === "kebab") {
          newStem = newStem
            .replace(/[_\s]+/g, "-")
            .replace(/([a-z])([A-Z])/g, "$1-$2")
            .toLowerCase();
        } else if (caseType === "snake") {
          newStem = newStem
            .replace(/[-\s]+/g, "_")
            .replace(/([a-z])([A-Z])/g, "$1_$2")
            .toLowerCase();
        }
      } else if (method === "extension") {
        if (customExt) {
          newExt = customExt.replace(/^\./, "");
        }
        if (lowercaseExt) {
          newExt = newExt.toLowerCase();
        }
      }

      const finalName = newExt ? `${newStem}.${newExt}` : newStem;
      const isChanged = finalName !== file.originalName;

      return {
        ...file,
        finalName,
        isChanged,
      };
    });
  }, [
    files,
    method,
    findText,
    replaceText,
    useRegex,
    matchCase,
    prefix,
    suffix,
    numberPrefix,
    numberSuffix,
    startNum,
    padding,
    keepOriginalName,
    caseType,
    customExt,
    lowercaseExt,
  ]);

  // Conflict detection
  const conflicts = useMemo(() => {
    const names = new Set<string>();
    const dupes = new Set<string>();
    for (const item of plannedList) {
      if (names.has(item.finalName)) {
        dupes.add(item.finalName);
      }
      names.add(item.finalName);
    }
    return dupes;
  }, [plannedList]);

  // ── Execute Batch Rename ──────────────────────────────────────────
  const executeRename = async () => {
    if (plannedList.length === 0) return;
    setError("");
    setBusy(true);
    setReport(null);
    setUndoReport(null);

    const pairs: RenamePair[] = plannedList
      .filter((item) => item.isChanged)
      .map((item) => ({
        original_path: item.fullPath,
        new_name: item.finalName,
      }));

    if (pairs.length === 0) {
      setError("No files will be modified by the current rules.");
      setBusy(false);
      return;
    }

    try {
      const rep = await invoke<BatchRenameReport>("execute_batch_rename", { pairs });
      setReport(rep);

      // Refresh files list with new names
      if (rep.successful > 0) {
        const renamedMap = new Map<string, string>(rep.renamed_pairs);
        setFiles((prev) =>
          prev.map((f) => {
            const nextPath = renamedMap.get(f.fullPath);
            if (nextPath) {
              const norm = nextPath.replace(/\\/g, "/");
              const parts = norm.split("/");
              const originalName = parts[parts.length - 1];
              const lastDot = originalName.lastIndexOf(".");
              const stem = lastDot > 0 ? originalName.slice(0, lastDot) : originalName;
              const ext = lastDot > 0 ? originalName.slice(lastDot + 1) : "";
              return {
                ...f,
                fullPath: nextPath,
                originalName,
                stem,
                ext,
              };
            }
            return f;
          })
        );
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  // ── Undo Last Rename ──────────────────────────────────────────────
  const undoRename = async () => {
    setError("");
    setBusy(true);
    try {
      const rep = await invoke<UndoRenameReport>("undo_last_rename");
      setUndoReport(rep);
      setReport(null);
      // The rows still hold the *renamed* paths while the disk now has the
      // originals; the next Apply would fail with "Source not found". Start
      // the list clean instead of leaving stale rows behind.
      if (rep.restored > 0) setFiles([]);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const changedCount = plannedList.filter((i) => i.isChanged).length;

  return (
    <div className="batch-renamer-container" style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* Header section */}
      <section className="glass" style={{ padding: "20px 24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "16px" }}>
          <div>
            <h2 style={{ margin: 0, fontSize: "1.3rem", fontWeight: 700, letterSpacing: "-0.02em" }}>
              {t.br_title}
            </h2>
            <p className="muted" style={{ margin: "4px 0 0", fontSize: "0.88rem" }}>
              {t.br_desc}
            </p>
          </div>

          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            <button type="button" className="hero-browse-btn" onClick={addFiles} style={{ padding: "9px 18px" }}>
              <span>{t.br_add_files}</span>
            </button>
            <button type="button" className="capsule-btn-pill" onClick={addFolder} style={{ padding: "9px 16px" }}>
              <span>{t.br_add_folder}</span>
            </button>
            {files.length > 0 && (
              <button type="button" className="capsule-btn-pill" onClick={clearAll} style={{ padding: "9px 16px" }}>
                <span>{t.br_clear}</span>
              </button>
            )}
          </div>
        </div>

        {/* Method Picker Tabs */}
        <div
          style={{
            marginTop: "20px",
            paddingTop: "16px",
            borderTop: "1px solid rgba(255,255,255,0.08)",
            display: "flex",
            gap: "8px",
            flexWrap: "wrap",
          }}
        >
          <button
            type="button"
            className={`capsule-tab ${method === "replace" ? "active" : ""}`}
            onClick={() => setMethod("replace")}
            style={{ borderRadius: "8px", padding: "6px 14px", fontSize: "0.85rem" }}
          >
            {t.br_method_replace}
          </button>
          <button
            type="button"
            className={`capsule-tab ${method === "affix" ? "active" : ""}`}
            onClick={() => setMethod("affix")}
            style={{ borderRadius: "8px", padding: "6px 14px", fontSize: "0.85rem" }}
          >
            {t.br_method_affix}
          </button>
          <button
            type="button"
            className={`capsule-tab ${method === "numbering" ? "active" : ""}`}
            onClick={() => setMethod("numbering")}
            style={{ borderRadius: "8px", padding: "6px 14px", fontSize: "0.85rem" }}
          >
            {t.br_method_numbering}
          </button>
          <button
            type="button"
            className={`capsule-tab ${method === "case" ? "active" : ""}`}
            onClick={() => setMethod("case")}
            style={{ borderRadius: "8px", padding: "6px 14px", fontSize: "0.85rem" }}
          >
            {t.br_method_case}
          </button>
          <button
            type="button"
            className={`capsule-tab ${method === "extension" ? "active" : ""}`}
            onClick={() => setMethod("extension")}
            style={{ borderRadius: "8px", padding: "6px 14px", fontSize: "0.85rem" }}
          >
            {t.br_method_extension}
          </button>
        </div>

        {/* Dynamic Controls per Method */}
        <div style={{ marginTop: "16px", padding: "16px", background: "rgba(255,255,255,0.03)", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.06)" }}>
          {method === "replace" && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "16px", alignItems: "center" }}>
              <div style={{ flex: 1, minWidth: "200px" }}>
                <label style={{ display: "block", fontSize: "0.8rem", opacity: 0.8, marginBottom: "4px" }}>
                  {t.br_find_label}
                </label>
                <input
                  type="text"
                  value={findText}
                  onChange={(e) => setFindText(e.target.value)}
                  placeholder={t.br_find_ph}
                  style={{ width: "100%", background: "rgba(255,255,255,0.08)", color: "inherit", border: "1px solid rgba(255,255,255,0.15)", borderRadius: "8px", padding: "8px 12px", outline: "none" }}
                />
              </div>

              <div style={{ flex: 1, minWidth: "200px" }}>
                <label style={{ display: "block", fontSize: "0.8rem", opacity: 0.8, marginBottom: "4px" }}>
                  {t.br_replace_label}
                </label>
                <input
                  type="text"
                  value={replaceText}
                  onChange={(e) => setReplaceText(e.target.value)}
                  placeholder={t.br_replace_ph}
                  style={{ width: "100%", background: "rgba(255,255,255,0.08)", color: "inherit", border: "1px solid rgba(255,255,255,0.15)", borderRadius: "8px", padding: "8px 12px", outline: "none" }}
                />
              </div>

              <div style={{ display: "flex", gap: "16px", alignItems: "center", marginTop: "20px" }}>
                <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.85rem", cursor: "pointer" }}>
                  <input type="checkbox" checked={matchCase} onChange={(e) => setMatchCase(e.target.checked)} />
                  {t.br_match_case}
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.85rem", cursor: "pointer" }}>
                  <input type="checkbox" checked={useRegex} onChange={(e) => setUseRegex(e.target.checked)} />
                  {t.br_regex}
                </label>
              </div>
            </div>
          )}

          {method === "affix" && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "16px" }}>
              <div style={{ flex: 1, minWidth: "200px" }}>
                <label style={{ display: "block", fontSize: "0.8rem", opacity: 0.8, marginBottom: "4px" }}>
                  {t.br_prefix_label}
                </label>
                <input
                  type="text"
                  value={prefix}
                  onChange={(e) => setPrefix(e.target.value)}
                  placeholder={t.br_prefix_ph}
                  style={{ width: "100%", background: "rgba(255,255,255,0.08)", color: "inherit", border: "1px solid rgba(255,255,255,0.15)", borderRadius: "8px", padding: "8px 12px", outline: "none" }}
                />
              </div>
              <div style={{ flex: 1, minWidth: "200px" }}>
                <label style={{ display: "block", fontSize: "0.8rem", opacity: 0.8, marginBottom: "4px" }}>
                  {t.br_suffix_label}
                </label>
                <input
                  type="text"
                  value={suffix}
                  onChange={(e) => setSuffix(e.target.value)}
                  placeholder={t.br_suffix_ph}
                  style={{ width: "100%", background: "rgba(255,255,255,0.08)", color: "inherit", border: "1px solid rgba(255,255,255,0.15)", borderRadius: "8px", padding: "8px 12px", outline: "none" }}
                />
              </div>
            </div>
          )}

          {method === "numbering" && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "16px", alignItems: "center" }}>
              <div style={{ flex: 1, minWidth: "150px" }}>
                <label style={{ display: "block", fontSize: "0.8rem", opacity: 0.8, marginBottom: "4px" }}>
                  {t.br_num_prefix_label}
                </label>
                <input
                  type="text"
                  value={numberPrefix}
                  onChange={(e) => setNumberPrefix(e.target.value)}
                  placeholder={t.br_num_prefix_ph}
                  style={{ width: "100%", background: "rgba(255,255,255,0.08)", color: "inherit", border: "1px solid rgba(255,255,255,0.15)", borderRadius: "8px", padding: "8px 12px", outline: "none" }}
                />
              </div>
              <div style={{ flex: 1, minWidth: "150px" }}>
                <label style={{ display: "block", fontSize: "0.8rem", opacity: 0.8, marginBottom: "4px" }}>
                  {t.br_num_suffix_label}
                </label>
                <input
                  type="text"
                  value={numberSuffix}
                  onChange={(e) => setNumberSuffix(e.target.value)}
                  placeholder={t.br_num_suffix_ph}
                  style={{ width: "100%", background: "rgba(255,255,255,0.08)", color: "inherit", border: "1px solid rgba(255,255,255,0.15)", borderRadius: "8px", padding: "8px 12px", outline: "none" }}
                />
              </div>
              <div style={{ width: "110px" }}>
                <label style={{ display: "block", fontSize: "0.8rem", opacity: 0.8, marginBottom: "4px" }}>
                  {t.br_start_from}
                </label>
                <input
                  type="number"
                  value={startNum}
                  onChange={(e) => setStartNum(Number(e.target.value))}
                  style={{ width: "100%", background: "rgba(255,255,255,0.08)", color: "inherit", border: "1px solid rgba(255,255,255,0.15)", borderRadius: "8px", padding: "8px 12px", outline: "none" }}
                />
              </div>
              <div style={{ width: "130px" }}>
                <label style={{ display: "block", fontSize: "0.8rem", opacity: 0.8, marginBottom: "4px" }}>
                  {t.br_padding}
                </label>
                <select
                  value={padding}
                  onChange={(e) => setPadding(Number(e.target.value))}
                  style={{ width: "100%", background: "rgba(255,255,255,0.08)", color: "inherit", border: "1px solid rgba(255,255,255,0.15)", borderRadius: "8px", padding: "8px 12px", outline: "none" }}
                >
                  <option value={1}>1, 2, 3</option>
                  <option value={2}>01, 02, 03</option>
                  <option value={3}>001, 002, 003</option>
                  <option value={4}>0001, 0002</option>
                </select>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "20px" }}>
                <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.85rem", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={keepOriginalName}
                    onChange={(e) => setKeepOriginalName(e.target.checked)}
                  />
                  {t.br_keep_original}
                </label>
              </div>
            </div>
          )}

          {method === "case" && (
            <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
              {(["lower", "upper", "title", "kebab", "snake"] as const).map((ct) => (
                <button
                  key={ct}
                  type="button"
                  className={`capsule-btn-pill ${caseType === ct ? "active" : ""}`}
                  onClick={() => setCaseType(ct)}
                  style={{
                    padding: "8px 16px",
                    background: caseType === ct ? "rgba(255,255,255,0.12)" : undefined,
                    border: caseType === ct ? "1px solid var(--line-strong)" : undefined,
                  }}
                >
                  {ct === "lower" && t.br_case_lower}
                  {ct === "upper" && t.br_case_upper}
                  {ct === "title" && t.br_case_title}
                  {ct === "kebab" && t.br_case_kebab}
                  {ct === "snake" && t.br_case_snake}
                </button>
              ))}
            </div>
          )}

          {method === "extension" && (
            <div style={{ display: "flex", gap: "20px", alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ width: "200px" }}>
                <label style={{ display: "block", fontSize: "0.8rem", opacity: 0.8, marginBottom: "4px" }}>
                  {t.br_change_ext}
                </label>
                <input
                  type="text"
                  value={customExt}
                  onChange={(e) => setCustomExt(e.target.value)}
                  placeholder={t.br_ext_ph}
                  style={{ width: "100%", background: "rgba(255,255,255,0.08)", color: "inherit", border: "1px solid rgba(255,255,255,0.15)", borderRadius: "8px", padding: "8px 12px", outline: "none" }}
                />
              </div>
              <div style={{ marginTop: "20px" }}>
                <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.85rem", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={lowercaseExt}
                    onChange={(e) => setLowercaseExt(e.target.checked)}
                  />
                  {t.br_force_lower_ext}
                </label>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Error Bar */}
      {error && (
        <div className="error-bar" role="alert" onClick={() => setError("")} style={{ margin: 0 }}>
          <span>⚠️ {error}</span>
          <span style={{ fontSize: "12px", opacity: 0.8, cursor: "pointer" }}>✕</span>
        </div>
      )}

      {/* Success / Report Banners */}
      {report && (
        <section className="glass" style={{ padding: "16px 20px", border: "1px solid rgba(34,197,94,0.3)", background: "rgba(34,197,94,0.08)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h4 style={{ margin: 0, color: "#4ade80" }}>
              {fmt(t.br_renamed_ok, {
                count: report.successful,
                unit: report.successful === 1 ? t.br_file_singular : t.br_file_plural,
              })}
            </h4>
            {report.failed > 0 && (
              <p style={{ margin: "4px 0 0", color: "#f87171", fontSize: "0.85rem" }}>
                {fmt(t.br_failed, { count: report.failed, errors: report.errors.join(", ") })}
              </p>
            )}
          </div>
          <button type="button" className="capsule-btn-pill" onClick={undoRename} disabled={busy}>
            {t.br_undo}
          </button>
        </section>
      )}

      {undoReport && (
        <section className="glass" style={{ padding: "16px 20px", border: "1px solid rgba(59,130,246,0.3)", background: "rgba(59,130,246,0.08)" }}>
          <h4 style={{ margin: 0, color: "#60a5fa" }}>
            {fmt(t.br_restored, {
              count: undoReport.restored,
              unit: undoReport.restored === 1 ? t.br_file_singular : t.br_file_plural,
            })}
          </h4>
        </section>
      )}

      {/* Conflict Warning */}
      {conflicts.size > 0 && (
        <div className="error-bar" style={{ margin: 0, background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)" }}>
          <span>
            {fmt(t.br_conflict, { names: Array.from(conflicts).join(", ") })}
          </span>
        </div>
      )}

      {/* File List Table */}
      {files.length === 0 ? (
        <section
          className="glass"
          onClick={addFiles}
          style={{
            padding: "60px 24px",
            textAlign: "center",
            cursor: "pointer",
            border: "2px dashed rgba(255,255,255,0.12)",
            borderRadius: "16px",
          }}
        >
          <div style={{ fontSize: "3rem", marginBottom: "12px", opacity: 0.8 }}>✏️</div>
          <h3 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 600 }}>{t.br_empty_title}</h3>
          <p className="muted" style={{ margin: "6px auto 16px", maxWidth: "420px", fontSize: "0.88rem" }}>
            {t.br_empty_desc}
          </p>
          <button type="button" className="hero-browse-btn" style={{ padding: "10px 22px" }}>
            {t.br_choose_files}
          </button>
        </section>
      ) : (
        <section className="glass" style={{ padding: "20px 24px" }}>
          {/* Action Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
            <div style={{ fontSize: "0.9rem" }}>
              <span>{fmt(t.br_selected_count, { count: files.length })}</span>
              <span style={{ color: changedCount > 0 ? "#4ade80" : "inherit", fontWeight: 600 }}>
                {fmt(t.br_will_modify, { count: changedCount })}
              </span>
            </div>

            <button
              type="button"
              className="hero-browse-btn"
              onClick={executeRename}
              disabled={busy || changedCount === 0 || conflicts.size > 0}
              style={{
                
                fontWeight: 600,
                opacity: changedCount === 0 || conflicts.size > 0 ? 0.4 : 1,
              }}
            >
              {busy ? t.br_renaming : fmt(t.br_apply, { count: changedCount })}
            </button>
          </div>

          <div className="disk-table-container">
            <table className="disk-table">
              <thead>
                <tr>
                  <th style={{ width: "40px" }}>#</th>
                  <th>{t.br_col_original}</th>
                  <th>{t.br_col_new}</th>
                  <th style={{ width: "90px" }}>{t.br_col_status}</th>
                  <th style={{ width: "50px" }}></th>
                </tr>
              </thead>
              <tbody>
                {plannedList.map((item, idx) => {
                  const hasConflict = conflicts.has(item.finalName);
                  return (
                    <tr key={item.id}>
                      <td className="muted">{idx + 1}</td>
                      <td className="disk-cell-name" title={item.originalName}>
                        {item.originalName}
                      </td>
                      <td
                        className="disk-cell-name"
                        title={item.finalName}
                        style={{
                          color: hasConflict ? "#f87171" : item.isChanged ? "#4ade80" : "inherit",
                          fontWeight: item.isChanged ? 600 : 400,
                        }}
                      >
                        {item.finalName}
                      </td>
                      <td>
                        {hasConflict ? (
                          <span className="badge" style={{ background: "rgba(239,68,68,0.2)", color: "#f87171" }}>
                            {t.br_status_conflict}
                          </span>
                        ) : item.isChanged ? (
                          <span className="badge" style={{ background: "rgba(34,197,94,0.15)", color: "#4ade80" }}>
                            {t.br_status_modified}
                          </span>
                        ) : (
                          <span className="badge muted">{t.br_status_unchanged}</span>
                        )}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="capsule-btn-icon"
                          onClick={() => removeFile(item.id)}
                          title={t.br_remove_file}
                          style={{ width: "24px", height: "24px", fontSize: "0.75rem", color: "#f87171" }}
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
