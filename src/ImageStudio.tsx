import { useState, useRef, useEffect, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { ProcessedImagePayload, ImageOptimizationReport } from "./types";
import { fmt, getStrings, type Locale } from "./i18n";

interface StudioImageItem {
  id: string;
  path: string;
  name: string;
  stem: string;
  originalExt: string;
  size: number;
  previewUrl: string;
  width: number;
  height: number;
}

type TargetFormat = "webp" | "jpeg" | "png";

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB"];
  let v = n;
  let i = -1;
  do {
    v /= 1024;
    i++;
  } while (v >= 1024 && i < units.length - 1);
  return `${v.toFixed(v >= 100 ? 0 : 1)} ${units[i]}`;
}

export default function ImageStudio({ lang }: { lang: Locale }) {
  const t = getStrings(lang);
  const [images, setImages] = useState<StudioImageItem[]>([]);
  const [format, setFormat] = useState<TargetFormat>("webp");
  const [quality, setQuality] = useState<number>(0.82); // 82% sweet spot for WebP/JPEG
  const [maxDimension, setMaxDimension] = useState<number>(0); // 0 = no clamp
  const [suffix, setSuffix] = useState<string>("_optimized");
  const [outputDir, setOutputDir] = useState<string>("");

  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [report, setReport] = useState<ImageOptimizationReport | null>(null);
  const [error, setError] = useState<string>("");

  // Clean up object URLs on unmount
  const imagesRef = useRef(images);
  imagesRef.current = images;
  useEffect(() => {
    return () => {
      imagesRef.current.forEach((img) => URL.revokeObjectURL(img.previewUrl));
    };
  }, []);

  // ── Action: Pick Images ───────────────────────────────────────────
  const pickImages = async () => {
    setError("");
    setReport(null);
    try {
      const paths = await invoke<string[] | null>("pick_images_for_studio");
      if (!paths || paths.length === 0) return;

      const newItems: StudioImageItem[] = [];
      for (const path of paths) {
        if (images.some((im) => im.path === path)) continue;

        try {
          const bytes = await invoke<number[]>("read_file_binary", { path });
          const u8 = new Uint8Array(bytes);
          const ext = path.split(".").pop()?.toLowerCase() || "png";
          const mime =
            ext === "jpg" || ext === "jpeg"
              ? "image/jpeg"
              : ext === "webp"
              ? "image/webp"
              : ext === "gif"
              ? "image/gif"
              : ext === "bmp"
              ? "image/bmp"
              : "image/png";

          const blob = new Blob([u8], { type: mime });
          const previewUrl = URL.createObjectURL(blob);
          const normalized = path.replace(/\\/g, "/");
          const name = normalized.split("/").pop() || "image";
          const lastDot = name.lastIndexOf(".");
          const stem = lastDot > 0 ? name.slice(0, lastDot) : name;

          // Determine dimensions
          const dimensions = await new Promise<{ w: number; h: number }>((resolve) => {
            const tempImg = new Image();
            tempImg.onload = () => resolve({ w: tempImg.naturalWidth, h: tempImg.naturalHeight });
            tempImg.onerror = () => resolve({ w: 0, h: 0 });
            tempImg.src = previewUrl;
          });

          newItems.push({
            id: `${path}_${Date.now()}_${Math.random()}`,
            path,
            name,
            stem,
            originalExt: ext,
            size: u8.length,
            previewUrl,
            width: dimensions.w,
            height: dimensions.h,
          });

          // Default output folder to the folder of the first image if not set
          if (!outputDir) {
            const parent = normalized.split("/").slice(0, -1).join("/");
            setOutputDir(parent);
          }
        } catch (e) {
          console.error("Failed reading image:", path, e);
        }
      }

      setImages((prev) => [...prev, ...newItems]);
    } catch (e) {
      setError(String(e));
    }
  };

  const pickOutputFolder = async () => {
    try {
      const folder = await invoke<string | null>("pick_output_folder");
      if (folder) setOutputDir(folder);
    } catch (e) {
      setError(String(e));
    }
  };

  const removeImage = (id: string) => {
    setImages((prev) => {
      const item = prev.find((i) => i.id === id);
      if (item) URL.revokeObjectURL(item.previewUrl);
      return prev.filter((i) => i.id !== id);
    });
  };

  const clearAll = () => {
    images.forEach((img) => URL.revokeObjectURL(img.previewUrl));
    setImages([]);
    setReport(null);
    setError("");
  };

  // ── Client-side Canvas Image Optimizer ────────────────────────────
  const processImageCanvas = (
    item: StudioImageItem,
    targetFmt: TargetFormat,
    q: number,
    clampDim: number
  ): Promise<{ data: Uint8Array; width: number; height: number; newSize: number }> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        let w = img.naturalWidth || img.width;
        let h = img.naturalHeight || img.height;

        if (clampDim > 0 && (w > clampDim || h > clampDim)) {
          if (w >= h) {
            h = Math.round((h / w) * clampDim);
            w = clampDim;
          } else {
            w = Math.round((w / h) * clampDim);
            h = clampDim;
          }
        }

        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, w);
        canvas.height = Math.max(1, h);
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Unable to create canvas 2D context"));

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";

        // For JPEG, fill background with white in case of transparency
        if (targetFmt === "jpeg") {
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, w, h);
        }

        ctx.drawImage(img, 0, 0, w, h);

        const mime = targetFmt === "webp" ? "image/webp" : targetFmt === "jpeg" ? "image/jpeg" : "image/png";

        canvas.toBlob(
          async (blob) => {
            if (!blob) return reject(new Error("Failed converting canvas to blob"));
            const ab = await blob.arrayBuffer();
            const u8 = new Uint8Array(ab);
            resolve({
              data: u8,
              width: w,
              height: h,
              newSize: u8.length,
            });
          },
          mime,
          targetFmt === "png" ? undefined : q
        );
      };

      img.onerror = () => reject(new Error(`Failed to decode image: ${item.name}`));
      img.src = item.previewUrl;
    });
  };

  // ── Execute Optimization & Export ─────────────────────────────────
  const runOptimization = async () => {
    if (images.length === 0) return;
    setError("");
    setReport(null);
    setProcessing(true);
    setProgress({ current: 0, total: images.length });

    try {
      const targetDir = outputDir || images[0].path.replace(/\\/g, "/").split("/").slice(0, -1).join("/");
      const payloads: ProcessedImagePayload[] = [];
      const ext = format === "jpeg" ? "jpg" : format;

      for (let i = 0; i < images.length; i++) {
        const item = images[i];
        setProgress({ current: i + 1, total: images.length });

        const processed = await processImageCanvas(item, format, quality, maxDimension);
        const outName = `${item.stem}${suffix}.${ext}`;

        payloads.push({
          original_path: item.path,
          output_filename: outName,
          data: Array.from(processed.data),
        });
      }

      const res = await invoke<ImageOptimizationReport>("save_optimized_images", {
        targetDir,
        images: payloads,
      });

      setReport(res);
    } catch (e) {
      setError(String(e));
    } finally {
      setProcessing(false);
      setProgress(null);
    }
  };

  const openPath = (path: string) => {
    invoke("open_in_file_manager", { path }).catch(console.error);
  };

  const totalRawSize = useMemo(() => {
    return images.reduce((acc, curr) => acc + curr.size, 0);
  }, [images]);

  return (
    <div className="image-studio-container" style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* ── Top Header Section ────────────────────────────────────── */}
      <section className="glass" style={{ padding: "20px 24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "16px" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <h2 style={{ margin: 0, fontSize: "1.3rem", fontWeight: 700, letterSpacing: "-0.02em" }}>
                {t.is_title}
              </h2>
              <span className="capsule-badge">
                {t.is_badge}
              </span>
            </div>
            <p className="muted" style={{ margin: "4px 0 0", fontSize: "0.88rem" }}>
              {t.is_desc}
            </p>
          </div>

          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            <button
              type="button"
              className="hero-browse-btn"
              onClick={pickImages}
              disabled={processing}
              style={{ padding: "8px 18px", fontSize: "0.9rem" }}
            >
              <span>{t.is_add_images}</span>
            </button>
            {images.length > 0 && (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={clearAll}
                disabled={processing}
                style={{ padding: "8px 14px", fontSize: "0.85rem" }}
              >
                {t.is_clear_all}
              </button>
            )}
          </div>
        </div>
      </section>

      {/* ── Error Banner ──────────────────────────────────────────── */}
      {error && (
        <div className="error-bar" role="alert" onClick={() => setError("")} style={{ margin: 0 }}>
          <span>⚠️ {error}</span>
          <span style={{ fontSize: "12px", opacity: 0.8, cursor: "pointer" }}>✕</span>
        </div>
      )}

      {/* ── Success Banner ────────────────────────────────────────── */}
      {report && (
        <section
          className="glass"
          style={{
            padding: "20px 24px",
            border: "1px solid rgba(34,197,94,0.3)",
            background: "rgba(34,197,94,0.08)",
            borderRadius: "16px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "16px" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "1.4rem" }}>✨</span>
                <h4 style={{ margin: 0, color: "#4ade80", fontSize: "1.1rem" }}>{t.is_success_title}</h4>
              </div>
              <p className="muted" style={{ margin: "6px 0 0", fontSize: "0.88rem" }}>
                {fmt(t.is_saved_success, { count: report.saved_count })}
                <code style={{ color: "inherit", fontWeight: 600 }}>{report.target_dir}</code>
              </p>
              <div style={{ display: "flex", gap: "20px", marginTop: "12px" }}>
                <div>
                  <span className="muted" style={{ fontSize: "0.75rem", textTransform: "uppercase" }}>{t.is_original} </span>
                  <b>{formatBytes(report.original_total_bytes)}</b>
                </div>
                <div>
                  <span className="muted" style={{ fontSize: "0.75rem", textTransform: "uppercase" }}>{t.is_optimized} </span>
                  <b style={{ color: "#4ade80" }}>{formatBytes(report.new_total_bytes)}</b>
                </div>
                <div>
                  <span className="muted" style={{ fontSize: "0.75rem", textTransform: "uppercase" }}>{t.is_saved_space} </span>
                  <b style={{ color: report.saved_bytes > 0 ? "#4ade80" : "inherit" }}>
                    {report.saved_bytes > 0
                      ? `-${formatBytes(report.saved_bytes)} ${fmt(t.is_reduction, { pct: Math.round((report.saved_bytes / report.original_total_bytes) * 100) })}`
                      : "+0 B"}
                  </b>
                </div>
              </div>
            </div>

            <div style={{ display: "flex", gap: "10px" }}>
              <button
                type="button"
                className="capsule-btn-pill"
                onClick={() => openPath(report.target_dir)}
                style={{ padding: "10px 18px", fontSize: "0.9rem" }}
              >
                <span>{t.is_open_folder}</span>
              </button>
            </div>
          </div>
        </section>
      )}

      {/* ── Main Work Area ────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "340px 1fr", gap: "20px", alignItems: "start" }}>
        {/* ── Controls & Settings Panel ───────────────────────────── */}
        <section className="glass" style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "20px" }}>
          <div>
            <h3 style={{ margin: "0 0 4px", fontSize: "1rem", fontWeight: 600 }}>{t.is_step1}</h3>
            <p className="muted" style={{ margin: 0, fontSize: "0.8rem" }}>
              {t.is_step1_desc}
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "6px", marginTop: "10px" }}>
              <button
                type="button"
                className={`capsule-tab ${format === "webp" ? "active" : ""}`}
                onClick={() => setFormat("webp")}
                style={{ padding: "8px 0", borderRadius: "8px", justifyContent: "center" }}
              >
                WebP
              </button>
              <button
                type="button"
                className={`capsule-tab ${format === "jpeg" ? "active" : ""}`}
                onClick={() => setFormat("jpeg")}
                style={{ padding: "8px 0", borderRadius: "8px", justifyContent: "center" }}
              >
                JPEG
              </button>
              <button
                type="button"
                className={`capsule-tab ${format === "png" ? "active" : ""}`}
                onClick={() => setFormat("png")}
                style={{ padding: "8px 0", borderRadius: "8px", justifyContent: "center" }}
              >
                PNG
              </button>
            </div>
            <div style={{ marginTop: "6px", fontSize: "0.78rem" }} className="muted">
              {format === "webp" && t.is_fmt_webp_desc}
              {format === "jpeg" && t.is_fmt_jpeg_desc}
              {format === "png" && t.is_fmt_png_desc}
            </div>
          </div>

          {/* Quality Slider (for lossy WebP and JPEG) */}
          <div style={{ opacity: format === "png" ? 0.45 : 1, pointerEvents: format === "png" ? "none" : "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 600 }}>{t.is_step2}</h3>
              <span className="mono" style={{ fontSize: "0.9rem", fontWeight: 700, color: "var(--text)" }}>
                {Math.round(quality * 100)}%
              </span>
            </div>
            <p className="muted" style={{ margin: "2px 0 10px", fontSize: "0.8rem" }}>
              {quality >= 0.85 ? t.is_quality_pristine : quality >= 0.7 ? t.is_quality_balanced : t.is_quality_aggressive}
            </p>
            <input
              type="range"
              min="0.5"
              max="1.0"
              step="0.05"
              value={quality}
              onChange={(e) => setQuality(parseFloat(e.target.value))}
              style={{ width: "100%", accentColor: "var(--theme-accent)", cursor: "pointer" }}
            />
          </div>

          {/* Max Dimension Clamping */}
          <div>
            <h3 style={{ margin: "0 0 4px", fontSize: "1rem", fontWeight: 600 }}>{t.is_step3}</h3>
            <p className="muted" style={{ margin: "0 0 10px", fontSize: "0.8rem" }}>
              {t.is_step3_desc}
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
              {[
                { label: t.is_dim_original, val: 0 },
                { label: "4K (3840px)", val: 3840 },
                { label: "FHD (1920px)", val: 1920 },
                { label: "HD (1280px)", val: 1280 },
                { label: "Web (800px)", val: 800 },
              ].map((opt) => (
                <button
                  key={opt.val}
                  type="button"
                  className={`capsule-btn-pill ${maxDimension === opt.val ? "active" : ""}`}
                  onClick={() => setMaxDimension(opt.val)}
                  style={{
                    padding: "5px 10px",
                    fontSize: "0.78rem",
                    border: maxDimension === opt.val ? "1px solid var(--line-strong)" : undefined,
                    background: maxDimension === opt.val ? "rgba(255,255,255,0.12)" : undefined,
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Filename Suffix */}
          <div>
            <h3 style={{ margin: "0 0 4px", fontSize: "1rem", fontWeight: 600 }}>{t.is_step4}</h3>
            <p className="muted" style={{ margin: "0 0 8px", fontSize: "0.8rem" }}>
              {t.is_step4_desc}
            </p>
            <input
              type="text"
              value={suffix}
              onChange={(e) => setSuffix(e.target.value)}
              placeholder={t.is_step4_ph}
              style={{
                width: "100%",
                padding: "8px 12px",
                borderRadius: "8px",
                border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(0,0,0,0.2)",
                color: "var(--text)",
                boxSizing: "border-box",
                fontSize: "0.85rem",
              }}
            />
          </div>

          {/* Output Destination Folder */}
          <div>
            <h3 style={{ margin: "0 0 4px", fontSize: "1rem", fontWeight: 600 }}>{t.is_step5}</h3>
            <div style={{ display: "flex", gap: "8px", marginTop: "6px" }}>
              <input
                type="text"
                value={outputDir}
                readOnly
                placeholder={t.is_choose_folder_ph}
                onClick={pickOutputFolder}
                style={{
                  flex: 1,
                  padding: "8px 12px",
                  borderRadius: "8px",
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "rgba(0,0,0,0.2)",
                  color: "var(--text)",
                  fontSize: "0.8rem",
                  cursor: "pointer",
                }}
              />
              <button
                type="button"
                className="btn btn-ghost"
                onClick={pickOutputFolder}
                style={{ padding: "8px 12px", fontSize: "0.85rem" }}
              >
                {t.common_browse}
              </button>
            </div>
          </div>

          {/* Action Button */}
          <div style={{ marginTop: "10px" }}>
            <button
              type="button"
              className="hero-browse-btn"
              onClick={runOptimization}
              disabled={images.length === 0 || processing}
              style={{
                width: "100%",
                justifyContent: "center",
                
                padding: "12px",
                fontSize: "0.95rem",
                fontWeight: 600,
                opacity: images.length === 0 || processing ? 0.5 : 1,
              }}
            >
              {processing
                ? `${t.is_optimizing} (${progress ? `${progress.current}/${progress.total}` : "..."})`
                : `${t.is_optimize}${images.length > 0 ? ` (${images.length})` : ""}`}
            </button>
          </div>
        </section>

        {/* ── Images Queue Grid / Empty State ──────────────────────── */}
        <section style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {images.length === 0 ? (
            <div
              className="glass"
              onClick={pickImages}
              style={{
                padding: "60px 24px",
                textAlign: "center",
                cursor: "pointer",
                border: "2px dashed rgba(255,255,255,0.15)",
                borderRadius: "16px",
              }}
            >
              <div style={{ fontSize: "3rem", marginBottom: "12px" }}>📸</div>
              <h3 style={{ margin: "0 0 6px", fontSize: "1.2rem", fontWeight: 600 }}>{t.is_empty_title}</h3>
              <p className="muted" style={{ margin: "0 0 16px", fontSize: "0.9rem" }}>
                {t.is_empty_desc}
              </p>
              <button type="button" className="hero-browse-btn" style={{ padding: "8px 20px" }}>
                Browse Images...
              </button>
            </div>
          ) : (
            <>
              {/* Queue Header summary */}
              <div
                className="glass"
                style={{
                  padding: "12px 20px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  borderRadius: "12px",
                }}
              >
                <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
                  <span style={{ fontWeight: 600, fontSize: "0.95rem" }}>
                    <b>{images.length}</b> Image{images.length !== 1 ? "s" : ""}
                  </span>
                  <span className="muted" style={{ fontSize: "0.85rem" }}>
                    Total Input Size: <b style={{ color: "var(--text)" }}>{formatBytes(totalRawSize)}</b>
                  </span>
                </div>
                <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                  <span className="muted" style={{ fontSize: "0.8rem" }}>
                    Target: <b style={{ color: "var(--text)" }}>.{format === "jpeg" ? "jpg" : format}</b>
                  </span>
                </div>
              </div>

              {/* Grid of image cards */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
                  gap: "14px",
                  maxHeight: "680px",
                  overflowY: "auto",
                  paddingRight: "4px",
                }}
              >
                {images.map((item) => {
                  const targetExt = format === "jpeg" ? "jpg" : format;
                  const targetName = `${item.stem}${suffix}.${targetExt}`;

                  return (
                    <div
                      key={item.id}
                      className="glass"
                      style={{
                        padding: "10px",
                        borderRadius: "12px",
                        display: "flex",
                        flexDirection: "column",
                        gap: "8px",
                        position: "relative",
                        overflow: "hidden",
                      }}
                    >
                      {/* Image Thumbnail Container */}
                      <div
                        style={{
                          height: "140px",
                          width: "100%",
                          borderRadius: "8px",
                          overflow: "hidden",
                          background: "rgba(0,0,0,0.3)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          position: "relative",
                        }}
                      >
                        <img
                          src={item.previewUrl}
                          alt={item.name}
                          style={{
                            maxWidth: "100%",
                            maxHeight: "100%",
                            objectFit: "contain",
                          }}
                        />
                        {/* Remove Button Badge */}
                        <button
                          type="button"
                          onClick={() => removeImage(item.id)}
                          title={t.is_remove_queue}
                          style={{
                            position: "absolute",
                            top: "6px",
                            right: "6px",
                            background: "rgba(0,0,0,0.6)",
                            border: "none",
                            color: "#fff",
                            borderRadius: "50%",
                            width: "24px",
                            height: "24px",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: "12px",
                          }}
                        >
                          ✕
                        </button>
                      </div>

                      {/* Image Details */}
                      <div>
                        <div
                          className="ellipsis mono"
                          style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--text)" }}
                          title={item.name}
                        >
                          {item.name}
                        </div>
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            marginTop: "4px",
                            fontSize: "0.75rem",
                          }}
                          className="muted"
                        >
                          <span>{formatBytes(item.size)}</span>
                          <span>
                            {item.width && item.height ? `${item.width}×${item.height}` : ""}
                          </span>
                        </div>
                      </div>

                      {/* Output Name Preview */}
                      <div
                        style={{
                          background: "rgba(255,255,255,0.04)",
                          padding: "4px 8px",
                          borderRadius: "6px",
                          fontSize: "0.75rem",
                        }}
                      >
                        <span className="muted">{t.is_to} </span>
                        <span className="mono" style={{ color: "var(--text-muted)" }} title={targetName}>
                          {targetName}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
