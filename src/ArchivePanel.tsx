import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { DroppedPaths, ZipCreateReport, ZipExtractReport } from "./types";
import { fmt, getStrings, type Locale } from "./i18n";

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = n;
  let i = -1;
  do {
    v /= 1024;
    i++;
  } while (v >= 1024 && i < units.length - 1);
  return `${v.toFixed(v >= 100 ? 0 : 1)} ${units[i]}`;
}

function baseName(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || path;
}

export default function ArchivePanel({
  lang,
  dropped,
  seed,
  onSeedApplied,
}: {
  lang: Locale;
  dropped?: DroppedPaths | null;
  /** Files handed over from another tab, e.g. the ticked search results. */
  seed?: { paths: string[]; seq: number } | null;
  onSeedApplied?: (seq: number) => void;
}) {
  const t = getStrings(lang);
  const isRtl = lang === "fa";
  const fmtNum = (n: number) => n.toLocaleString(isRtl ? "fa-IR" : "en-US");

  const [sources, setSources] = useState<string[]>([]);
  const [dest, setDest] = useState("");
  // Only a path that came back from the save dialog has user consent to
  // replace an existing archive; a hand-typed path must not.
  const [destConfirmed, setDestConfirmed] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);
  const [createReport, setCreateReport] = useState<ZipCreateReport | null>(null);
  const [createError, setCreateError] = useState("");

  const [archive, setArchive] = useState("");
  const [target, setTarget] = useState("");
  const [overwrite, setOverwrite] = useState(false);
  const [extractBusy, setExtractBusy] = useState(false);
  const [extractReport, setExtractReport] = useState<ZipExtractReport | null>(null);
  const [extractError, setExtractError] = useState("");

  const append = (paths: string[]) => {
    setSources((prev) => {
      const seen = new Set(prev);
      const next = [...prev];
      for (const path of paths) {
        if (seen.has(path)) continue;
        seen.add(path);
        next.push(path);
      }
      return next;
    });
    setCreateReport(null);
  };

  const lastDrop = useRef(dropped?.seq ?? 0);
  useEffect(() => {
    if (!dropped || dropped.seq === lastDrop.current) return;
    lastDrop.current = dropped.seq;
    append(dropped.paths);
    setCreateError("");
  }, [dropped]);

  // A seed is consumed once, then reported back so the sender can clear it and
  // a later remount of this tab cannot re-add the same files.
  const lastSeed = useRef(0);
  useEffect(() => {
    if (!seed || seed.seq === lastSeed.current) return;
    lastSeed.current = seed.seq;
    append(seed.paths);
    setCreateError("");
    onSeedApplied?.(seed.seq);
  }, [seed]);

  const addFiles = async () => {
    setCreateError("");
    try {
      const picked = await invoke<string[] | null>("pick_files_for_zip");
      if (picked?.length) append(picked);
    } catch (e) {
      setCreateError(String(e));
    }
  };

  const addFolder = async () => {
    setCreateError("");
    try {
      const picked = await invoke<string | null>("pick_folder_for_zip");
      if (picked) append([picked]);
    } catch (e) {
      setCreateError(String(e));
    }
  };

  const chooseDest = async () => {
    setCreateError("");
    try {
      const picked = await invoke<string | null>("pick_save_zip", {
        defaultName: sources.length === 1 ? `${baseName(sources[0])}.zip` : "FileSorter.zip",
      });
      if (picked) {
        setDest(picked);
        setDestConfirmed(true);
      }
    } catch (e) {
      setCreateError(String(e));
    }
  };

  const create = async () => {
    if (!sources.length || !dest || createBusy) return;
    setCreateBusy(true);
    setCreateError("");
    setCreateReport(null);
    try {
      const report = await invoke<ZipCreateReport>("create_zip", {
        req: { sources, destination: dest, base: null, overwrite: destConfirmed },
      });
      setCreateReport(report);
    } catch (e) {
      setCreateError(String(e));
    } finally {
      setCreateBusy(false);
    }
  };

  const pickArchive = async () => {
    setExtractError("");
    try {
      const picked = await invoke<string | null>("pick_zip_archive");
      if (picked) {
        setArchive(picked);
        setExtractReport(null);
      }
    } catch (e) {
      setExtractError(String(e));
    }
  };

  const pickTarget = async () => {
    setExtractError("");
    try {
      const picked = await invoke<string | null>("pick_folder");
      if (picked) {
        setTarget(picked);
        setExtractReport(null);
      }
    } catch (e) {
      setExtractError(String(e));
    }
  };

  const extract = async () => {
    if (!archive || !target || extractBusy) return;
    setExtractBusy(true);
    setExtractError("");
    setExtractReport(null);
    try {
      setExtractReport(
        await invoke<ZipExtractReport>("extract_zip", {
          req: { archive, destination: target, overwrite },
        }),
      );
    } catch (e) {
      setExtractError(String(e));
    } finally {
      setExtractBusy(false);
    }
  };

  const reveal = (folder: string) => {
    void invoke("open_in_file_manager", { path: folder });
  };

  return (
    <div className="tool-page">
      <section className="glass">
        <div className="dupes-header">
          <div>
            <h1>{t.arc_title}</h1>
            <p>{t.arc_desc}</p>
          </div>
        </div>

        {/* Create */}
        <div style={{ marginTop: "18px" }}>
          <div className="extras-head">
            <div>
              <h2>{t.arc_create_title}</h2>
              <p>{t.arc_create_desc}</p>
            </div>
            <div className="summary-actions">
              <button type="button" className="btn btn-ghost" onClick={() => void addFiles()}>
                {t.arc_add_files}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => void addFolder()}>
                {t.arc_add_folder}
              </button>
              {sources.length > 0 && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSources([])}>
                  {t.arc_clear}
                </button>
              )}
            </div>
          </div>

          {sources.length === 0 ? (
            <p className="panel-note">{t.arc_sources_empty}</p>
          ) : (
            <div className="extras-list mono" style={{ marginBottom: "12px" }}>
              {sources.map((path) => (
                <div key={path} className="ellipsis" title={path} style={{ display: "flex", gap: "10px" }}>
                  <span style={{ flex: 1 }}>{path}</span>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setSources((prev) => prev.filter((p) => p !== path))}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="field-row">
            <div className="field">
              <label>{t.arc_dest_label}</label>
              <div style={{ display: "flex", gap: "8px" }}>
                <input
                  type="text"
                  value={dest}
                  placeholder={t.arc_dest_ph}
                  onChange={(e) => {
                    setDest(e.target.value);
                    setDestConfirmed(false);
                  }}
                  style={{ flex: 1, minWidth: 0 }}
                />
                <button type="button" className="btn btn-ghost" onClick={() => void chooseDest()}>
                  {t.arc_choose_dest}
                </button>
              </div>
            </div>
            <div className="field" style={{ flex: "0 0 auto" }}>
              <label>&nbsp;</label>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => void create()}
                disabled={createBusy || !sources.length || !dest}
              >
                {createBusy ? t.arc_creating : t.arc_create}
              </button>
            </div>
          </div>

          {createError && (
            <div className="error-bar" role="alert" onClick={() => setCreateError("")} style={{ marginTop: "12px" }}>
              <span>{createError}</span>
              <span style={{ cursor: "pointer" }}>×</span>
            </div>
          )}

          {createReport && (
            <div className="alert alert-success" style={{ marginTop: "12px" }}>
              <span className="alert-label">{t.arc_title}</span>
              <span>
                {fmt(t.arc_done, {
                  count: fmtNum(createReport.files),
                  size: formatBytes(createReport.bytes),
                })}{" "}
                <b className="mono ellipsis" title={createReport.destination}>
                  {createReport.destination}
                </b>
                {createReport.skipped > 0 && " " + fmt(t.arc_skipped, { count: fmtNum(createReport.skipped) })}
              </span>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => reveal(createReport.destination)}>
                {t.arc_reveal}
              </button>
            </div>
          )}
        </div>

        {/* Extract */}
        <div style={{ marginTop: "26px" }}>
          <div className="extras-head">
            <div>
              <h2>{t.arc_extract_title}</h2>
              <p>{t.arc_extract_desc}</p>
            </div>
          </div>

          <div className="form-grid">
            <div className="field">
              <label>{t.arc_archive_label}</label>
              <div style={{ display: "flex", gap: "8px" }}>
                <input
                  type="text"
                  readOnly
                  value={archive}
                  placeholder={t.arc_archive_ph}
                  title={archive}
                  style={{ flex: 1, minWidth: 0 }}
                />
                <button type="button" className="btn btn-ghost" onClick={() => void pickArchive()}>
                  {t.arc_pick_archive}
                </button>
              </div>
            </div>
            <div className="field">
              <label>{t.arc_target_label}</label>
              <div style={{ display: "flex", gap: "8px" }}>
                <input
                  type="text"
                  readOnly
                  value={target}
                  placeholder={t.arc_target_ph}
                  title={target}
                  style={{ flex: 1, minWidth: 0 }}
                />
                <button type="button" className="btn btn-ghost" onClick={() => void pickTarget()}>
                  {t.cmp_pick}
                </button>
              </div>
            </div>
          </div>

          <div className="check-row" style={{ marginTop: "14px", alignItems: "center" }}>
            <label>
              <input type="checkbox" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} />
              {t.arc_overwrite}
            </label>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void extract()}
              disabled={extractBusy || !archive || !target}
            >
              {extractBusy ? t.arc_extracting : t.arc_extract}
            </button>
          </div>

          {extractError && (
            <div className="error-bar" role="alert" onClick={() => setExtractError("")} style={{ marginTop: "12px" }}>
              <span>{extractError}</span>
              <span style={{ cursor: "pointer" }}>×</span>
            </div>
          )}

          {extractReport && (
            <div className="alert alert-success" style={{ marginTop: "12px" }}>
              <span className="alert-label">{t.arc_title}</span>
              <span>
                {fmt(t.arc_extracted, {
                  count: fmtNum(extractReport.files),
                  size: formatBytes(extractReport.bytes),
                })}{" "}
                <b className="mono ellipsis" title={extractReport.destination}>
                  {extractReport.destination}
                </b>
                {extractReport.skipped > 0 && " " + fmt(t.arc_skipped, { count: fmtNum(extractReport.skipped) })}
              </span>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => reveal(extractReport.destination)}>
                {t.arc_reveal}
              </button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
